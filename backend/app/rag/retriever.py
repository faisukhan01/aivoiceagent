"""Chunking + in-memory vector store for retrieval.

Embeddings use OpenAI / Gemini when a key is configured; otherwise a
deterministic hash-based pseudo-embedding keeps local dev functional.
Turso's native libSQL vector search (F32_BLOB + vector_distance_cosine) is the
production target — swap `InMemoryVectorStore` for it once Turso creds land.
"""

from __future__ import annotations

import hashlib
import math

import numpy as np

EMBED_DIM = 256


def chunk_text(text: str, size: int = 1000, overlap: int = 150) -> list[str]:
    """Fixed-size overlapping character chunks."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    step = max(size - overlap, 1)
    return [text[i : i + size] for i in range(0, len(text), step)]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed chunks via OpenAI -> Gemini -> deterministic dev fallback."""
    from app.core.config import settings

    if settings.has_openai:
        return await _embed_openai(texts)
    if settings.has_google:
        return await _embed_google(texts)
    return [_pseudo_embed(t) for t in texts]


def _pseudo_embed(text: str) -> list[float]:
    """Deterministic bag-of-hashes embedding (dev only, zero dependencies)."""
    vec = np.zeros(EMBED_DIM, dtype=np.float32)
    for token in text.lower().split():
        digest = hashlib.md5(token.encode()).digest()
        idx = int.from_bytes(digest[:4], "little") % EMBED_DIM
        vec[idx] += 1.0
    norm = float(np.linalg.norm(vec)) or 1.0
    return (vec / norm).tolist()


async def _embed_openai(texts: list[str]) -> list[list[float]]:
    from openai import AsyncOpenAI  # lazy import

    from app.core.config import settings

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [d.embedding for d in resp.data]


async def _embed_google(texts: list[str]) -> list[list[float]]:
    from google import genai  # lazy import
    from google.genai import types

    from app.core.config import settings

    client = genai.Client(api_key=settings.google_api_key)
    result = await client.aio.models.embed_content(
        model="text-embedding-004",
        contents=[types.Content(parts=[types.Part(text=t)]) for t in texts],
        config=types.EmbedContentConfig(output_dimensionality=EMBED_DIM),
    )
    return [list(e.values) for e in result.embeddings]  # type: ignore[union-attr]


class InMemoryVectorStore:
    """Minimal cosine-similarity store (numpy). Fine for dev scale."""

    def __init__(self) -> None:
        self._ids: list[str] = []
        self._texts: list[str] = []
        self._matrix: np.ndarray | None = None

    def add(self, ids: list[str], texts: list[str], vectors: list[list[float]]) -> None:
        mat = np.asarray(vectors, dtype=np.float32)
        self._matrix = mat if self._matrix is None else np.vstack([self._matrix, mat])
        self._ids.extend(ids)
        self._texts.extend(texts)

    def search(self, query_vector: list[float], k: int = 5) -> list[tuple[str, str, float]]:
        if self._matrix is None or not self._ids:
            return []
        q = np.asarray(query_vector, dtype=np.float32)
        qn = np.linalg.norm(q) or 1.0
        mn = np.linalg.norm(self._matrix, axis=1, keepdims=True)
        mn[mn == 0] = 1.0
        scores = (self._matrix / mn) @ (q / qn)
        order = np.argsort(-scores)[:k]
        return [(self._ids[i], self._texts[i], float(scores[i])) for i in order]

    def __len__(self) -> int:
        return len(self._ids)


# Singleton store for the dev server process.
store = InMemoryVectorStore()


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)
