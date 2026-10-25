"""Retrieval-Augmented Generation package: document loading + vector search."""

from __future__ import annotations

from app.rag.loader import chunk_text, extract_text
from app.rag.retriever import InMemoryVectorStore, embed_texts

__all__ = ["InMemoryVectorStore", "chunk_text", "embed_texts", "extract_text"]
