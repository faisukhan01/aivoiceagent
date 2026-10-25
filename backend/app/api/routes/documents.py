"""Document ingestion endpoint: extract text and chunk counts via RAG loader."""

from __future__ import annotations

import logging
import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.rag.loader import chunk_text, extract_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
PREVIEW_CHARS = 400


class ExtractResponse(BaseModel):
    """Result of text extraction for one uploaded document."""

    filename: str
    chars: int = Field(ge=0)
    preview: str
    n_chunks: int = Field(ge=0)


@router.post("/extract", response_model=ExtractResponse)
async def extract_document(file: UploadFile = File(...)) -> ExtractResponse:
    """Upload a PDF/DOCX/TXT/MD/CSV/HTML file and get extracted text stats.

    Full text extraction is performed here; chunking is reported via
    ``n_chunks``. TODO: persist chunks + embeddings into the vector store /
    Turso for retrieval-augmented chat.
    """
    started = time.monotonic()
    filename = Path(file.filename or "upload.bin").name
    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file exceeds 20 MB limit")

    try:
        text = extract_text(filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — parser crashes become 422
        logger.exception("Extraction failed for %s", filename)
        raise HTTPException(status_code=422, detail=f"failed to parse document: {exc}") from exc

    chunks = chunk_text(text)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info("Extracted %s: %d chars, %d chunks in %d ms", filename, len(text), len(chunks), elapsed_ms)

    return ExtractResponse(
        filename=filename,
        chars=len(text),
        preview=text[:PREVIEW_CHARS],
        n_chunks=len(chunks),
    )
