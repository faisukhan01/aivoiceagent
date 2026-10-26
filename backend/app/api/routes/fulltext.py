"""Full-text extraction endpoint (returns complete text, not chunks)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.rag.loader import UnsupportedDocumentError, extract_text

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/fulltext")
async def fulltext(file: Annotated[UploadFile, File()]) -> dict[str, object]:
    """Extract the complete text of an uploaded document (pdf/docx/txt/md/html/csv)."""
    data = await file.read()
    name = file.filename or "document.txt"
    try:
        text = extract_text(name, data)
    except UnsupportedDocumentError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return {"filename": name, "chars": len(text), "text": text}
