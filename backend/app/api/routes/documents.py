"""Document ingestion endpoints for the RAG pipeline."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile

from app.rag.loader import UnsupportedDocumentError, extract_and_chunk
from app.rag.retriever import embed_texts, store

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/extract")
async def extract(file: UploadFile, chunk_size: int = 1000, overlap: int = 150) -> dict[str, object]:
    """Extract text from an uploaded document (pdf/docx/txt/md/html/csv)."""
    data = await file.read()
    name = file.filename or "document.txt"
    try:
        chunks = extract_and_chunk(name, data, chunk_size=chunk_size, overlap=overlap)
    except UnsupportedDocumentError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    return {
        "filename": name,
        "bytes": len(data),
        "chars": sum(len(c) for c in chunks),
        "n_chunks": len(chunks),
        "preview": chunks[0][:400] if chunks else "",
    }


@router.post("/ingest")
async def ingest(file: UploadFile, chunk_size: int = 1000, overlap: int = 150) -> dict[str, object]:
    """Extract, chunk, embed and index a document into the vector store."""
    data = await file.read()
    name = file.filename or "document.txt"
    try:
        chunks = extract_and_chunk(name, data, chunk_size=chunk_size, overlap=overlap)
    except UnsupportedDocumentError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    vectors = await embed_texts(chunks)
    ids = [f"{name}:{i}" for i in range(len(chunks))]
    store.add(ids, chunks, vectors)
    return {"filename": name, "indexed": len(chunks), "store_size": len(store)}
