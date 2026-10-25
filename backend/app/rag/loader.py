"""Document text extraction + chunking for the RAG pipeline.

Supported: PDF (pypdf), DOCX (python-docx), plain text / markdown / CSV,
HTML (BeautifulSoup4).
"""

from __future__ import annotations

import io

from app.rag.retriever import chunk_text


class UnsupportedDocumentError(ValueError):
    pass


def extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from raw document bytes based on file extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        return _extract_pdf(data)
    if ext == "docx":
        return _extract_docx(data)
    if ext in {"html", "htm"}:
        return _extract_html(data)
    if ext in {"txt", "md", "csv", "json", ""}:
        return data.decode("utf-8", errors="replace")
    raise UnsupportedDocumentError(f"Unsupported document type: .{ext}")


def extract_and_chunk(filename: str, data: bytes, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """Extract text and return overlapping chunks ready for embedding."""
    return chunk_text(extract_text(filename, data), size=chunk_size, overlap=overlap)


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader  # lazy import

    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(data: bytes) -> str:
    import io

    import docx  # lazy import

    document = docx.Document(io.BytesIO(data))
    return "\n\n".join(p.text for p in document.paragraphs if p.text.strip())


def _extract_html(data: bytes) -> str:
    from bs4 import BeautifulSoup  # lazy import

    soup = BeautifulSoup(data.decode("utf-8", errors="replace"), "html.parser")
    return soup.get_text(separator="\n")
