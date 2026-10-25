"""Document text extraction and chunking.

Supported formats:
* PDF       — ``pypdf`` (lazy import)
* DOCX      — ``python-docx`` (lazy import)
* TXT/MD/CSV/JSON-ish — UTF-8 decode (with latin-1 fallback)
* HTML/XHTML— ``beautifulsoup4`` (lazy import)

Heavy SDKs are imported lazily inside functions so the module imports
cleanly even if an optional dependency is missing (a ``ValueError`` with a
helpful message is raised per-file at extraction time instead).
"""

from __future__ import annotations

import logging
from pathlib import PurePosixPath

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 150


def _extension(filename: str) -> str:
    """Lowercased file extension without the dot."""
    return PurePosixPath(filename.replace("\\", "/")).suffix.lstrip(".").lower()


def extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from a document's bytes based on its filename.

    Args:
        filename: Original filename (extension selects the parser).
        data: Raw file bytes.

    Returns:
        Extracted plain text (may be empty for exotic documents).

    Raises:
        ValueError: For unsupported extensions or parse failures.
    """
    ext = _extension(filename)
    logger.info("Extracting text from %s (ext=%s, %d bytes)", filename, ext or "?", len(data))

    if ext == "pdf":
        return _extract_pdf(data)
    if ext == "docx":
        return _extract_docx(data)
    if ext == "doc":
        raise ValueError("Legacy .doc not supported — save as .docx or .pdf")
    if ext in {"html", "htm", "xhtml"}:
        return _extract_html(data)
    if ext in {"txt", "md", "markdown", "csv", "tsv", "json", "log"} or not ext:
        return _decode_utf8(data)
    # Best effort: try plain UTF-8 decode for unknown types.
    logger.warning("Unknown extension %r — attempting plain-text decode", ext)
    return _decode_utf8(data)


def _decode_utf8(data: bytes) -> str:
    """Decode bytes as UTF-8, falling back to latin-1 for legacy files."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="replace")


def _extract_pdf(data: bytes) -> str:
    try:
        import io

        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover
        raise ValueError("pypdf is required for PDF extraction") from exc

    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 — single corrupt page must not kill extraction
            pages.append("")
    return "\n\n".join(p.strip() for p in pages if p and p.strip())


def _extract_docx(data: bytes) -> str:
    try:
        import io

        import docx
    except ImportError as exc:  # pragma: no cover
        raise ValueError("python-docx is required for DOCX extraction") from exc

    document = docx.Document(io.BytesIO(data))
    parts = [p.text for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            line = " | ".join(c for c in cells if c)
            if line:
                parts.append(line)
    return "\n".join(parts)


def _extract_html(data: bytes) -> str:
    try:
        from bs4 import BeautifulSoup  # lazy import
    except ImportError as exc:  # pragma: no cover
        raise ValueError("beautifulsoup4 is required for HTML extraction") from exc

    soup = BeautifulSoup(_decode_utf8(data), "html.parser")
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def chunk_text(
    text: str,
    size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    """Split ``text`` into overlapping chunks for embedding.

    Args:
        text: Full document text.
        size: Target chunk length in characters.
        overlap: Characters shared between consecutive chunks.

    Returns:
        List of non-empty chunks. Empty input yields an empty list.
    """
    if not text:
        return []
    if size <= 0:
        raise ValueError("size must be positive")
    overlap = max(0, min(overlap, size - 1))

    chunks: list[str] = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = min(start + size, text_len)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_len:
            break
        start = end - overlap
    return chunks
