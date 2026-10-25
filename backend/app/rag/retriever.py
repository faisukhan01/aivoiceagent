"""Vector store and embedding helpers.

DEV MODE (default): when no embedding provider key is configured, we use
deterministic *pseudo-embeddings* derived from a SHA-256 hash of the text.
These are stable across runs (same text → same vector) and good enough to
exercise the retrieval plumbing end-to-end, but they carry NO semantic
meaning. Replace with real embeddings by configuring OPENAI_API_KEY or
GOOGLE_API_KEY.

Real embeddings (when keys present):
* OpenAI  — ``text-embedding-3-small`` via the ``openai`` SDK (lazy import).
* Gemini  — ``text-embedding-004`` via the ``google-genai`` SDK (lazy import).

The in-memory store keeps everything in numpy arrays and ranks by cosine
similarity — fine for prototypes; swap for Turso/libsql vector or a real
vector DB in production.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

import numpy as np

from app.core.config import get_settings

logger = logging.getLogger(__name__)

PSEUDO_EMBEDDING_DIM = 256
OPENAI_EMBED_MODEL = "text-embedding-3-small"
GEMINI_EMBED_MODEL = "text-embedding-004"


def _pseudo_embedding(text: str, dim: int = PSEUDO_EMBEDDING_DIM) -> np.ndarray:
    """Deterministic hash-based pseudo-embedding (DEV MODE ONLY).

    Repeatedly hashes the text to fill ``dim`` floats; values are uniform in
    [-1, 1] and the vector is L2-normalized so cosine similarity behaves.
    """
    out = np.zeros(dim, dtype=np.float32)
    seed = text.encode("utf-8")
    idx = 0
    counter = 0
    while idx < dim:
        digest = hashlib.sha256(seed + b"\x00" + counter.to_bytes(4, "little")).digest()
        for byte_pos in range(0, len(digest), 4):
            if idx >= dim:
                break
            word = int.from_bytes(digest[byte_pos : byte_pos + 4], "little")
            out[idx] = ((word % 20001) - 10000) / 10000.0
            idx += 1
        counter += 1
    norm = np.linalg.norm(out)
    return out / norm if norm > 0 else out


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts.

    Uses a real provider when a key is configured (OpenAI preferred, then
    Gemini); otherwise deterministic hash pseudo-embeddings (dev mode).
    """
    if not texts:
        return []

    settings = get_settings()
    if settings.has_openai:
        try:
            return _embed_openai(texts)
        except Exception:  # noqa: BLE001 — fall back to dev embeddings on API failure
            logger.exception("OpenAI embedding failed; using dev pseudo-embeddings")
    elif settings.has_google:
        try:
            return _embed_gemini(texts)
        except Exception:  # noqa: BLE001
            logger.exception("Gemini embedding failed; using dev pseudo-embeddings")
    else:
        logger.info("No embedding provider configured — dev-mode hash pseudo-embeddings in use")
    return [list(_pseudo_embedding(t)) for t in texts]


def embed_query(text: str) -> list[float]:
    """Embed a single query string (same pipeline as :func:`embed_texts`)."""
    return embed_texts([text])[0]


def _embed_openai(texts: list[str]) -> list[list[float]]:
    from openai import OpenAI  # lazy import

    client = OpenAI()
    resp = client.embeddings.create(model=OPENAI_EMBED_MODEL, input=texts)
    return [item.embedding for item in resp.data]


def _embed_gemini(texts: list[str]) -> list[list[float]]:
    from google import genai  # lazy import
    from google.genai import types  # lazy import

    client = genai.Client()
    resp = client.models.embed_content(
        model=GEMINI_EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(output_dimensionality=PSEUDO_EMBEDDING_DIM),
    )
    return [list(e.values) for e in resp.embeddings or []]


class InMemoryVectorStore:
    """Minimal cosine-similarity vector store backed by numpy arrays."""

    def __init__(self) -> None:
        self._ids: list[str] = []
        self._texts: list[str] = []
        self._matrix: np.ndarray | None = None  # (n, dim) float32, rows normalized

    def __len__(self) -> int:
        return len(self._ids)

    def add(self, doc_id: str, text: str, vector: list[float] | np.ndarray) -> None:
        """Insert or replace a document vector (upsert by id)."""
        vec = np.asarray(vector, dtype=np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        if doc_id in self._ids:
            i = self._ids.index(doc_id)
            self._texts[i] = text
            assert self._matrix is not None
            self._matrix[i] = vec
            return
        self._ids.append(doc_id)
        self._texts.append(text)
        self._matrix = vec[None, :] if self._matrix is None else np.vstack([self._matrix, vec])

    def add_texts(self, doc_id_prefix: str, texts: list[str]) -> int:
        """Embed + store a list of chunks; returns count stored."""
        vectors = embed_texts(texts)
        for i, (text, vec) in enumerate(zip(texts, vectors, strict=True)):
            self.add(f"{doc_id_prefix}:{i}", text, vec)
        return len(texts)

    def search(
        self,
        query_vector: list[float] | np.ndarray,
        k: int = 5,
    ) -> list[dict[str, Any]]:
        """Top-k cosine similarity search.

        Returns:
            List of ``{"id", "text", "score"}`` dicts, best match first.
        """
        if self._matrix is None or not self._ids:
            return []
        query = np.asarray(query_vector, dtype=np.float32)
        norm = np.linalg.norm(query)
        if norm > 0:
            query = query / norm
        scores = self._matrix @ query  # rows are normalized → dot = cosine
        k = max(1, min(k, len(self._ids)))
        top = np.argsort(scores)[::-1][:k]
        return [
            {"id": self._ids[i], "text": self._texts[i], "score": float(scores[i])}
            for i in top
        ]


vector_store = InMemoryVectorStore()
"""Process-wide in-memory store (prototype quality; swap for a real DB)."""
