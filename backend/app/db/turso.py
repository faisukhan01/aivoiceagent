"""Turso (libsql) connection management with local SQLite fallback.

* When ``TURSO_DATABASE_URL`` is set (``libsql://...`` or ``libsql+ws://...``),
  connect via ``libsql_experimental`` with the auth token.
* Otherwise fall back to a plain ``sqlite3`` file (``./local.db``) so the
  backend still has a workable store in dev environments.

The driver is imported lazily so the app boots even if the native extension
failed to install.
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

LOCAL_DB_PATH = Path("local.db")


def _is_turso_url(url: str) -> bool:
    """True for libsql:// or libsql+ws(s):// style Turso URLs."""
    return url.startswith(("libsql://", "libsql+ws://", "libsql+wss://"))


def get_conn() -> Any:
    """Return a live DB connection: Turso when configured, else local sqlite3.

    Returns:
        A DBAPI-style connection object (libsql or sqlite3).

    Raises:
        RuntimeError: When the Turso driver is unavailable or connection fails
            and no local fallback can be opened.
    """
    settings = get_settings()
    url = settings.TURSO_DATABASE_URL

    if url and _is_turso_url(url):
        try:
            import libsql_experimental as libsql  # lazy native import
        except ImportError:
            try:
                import libsql as libsql  # type: ignore[no-redef]
            except ImportError as exc:
                raise RuntimeError(
                    "TURSO_DATABASE_URL is set but no libsql driver is installed. "
                    "pip install libsql-experimental (or libsql)."
                ) from exc
        try:
            conn = (
                libsql.connect(url, auth_token=settings.TURSO_AUTH_TOKEN)
                if settings.TURSO_AUTH_TOKEN
                else libsql.connect(url)
            )
            logger.info("Connected to Turso at %s", url.split("?")[0])
            return conn
        except Exception as exc:  # noqa: BLE001 — surface driver errors clearly
            raise RuntimeError(f"Failed to connect to Turso: {exc}") from exc

    # Local SQLite fallback ------------------------------------------------- #
    conn = sqlite3.connect(LOCAL_DB_PATH)
    conn.row_factory = sqlite3.Row
    logger.info("Using local SQLite fallback at %s", LOCAL_DB_PATH.resolve())
    return conn


def check_connection() -> dict[str, Any]:
    """Run a trivial query against the active backend; used by /health-style checks."""
    try:
        conn = get_conn()
        try:
            cur = conn.execute("SELECT 1")
            cur.fetchone()
            url = get_settings().TURSO_DATABASE_URL or ""
            backend = "turso" if url and _is_turso_url(url) else "sqlite-local"
            return {"ok": True, "backend": backend}
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001 — health checks must never raise
        logger.warning("DB check failed: %s", exc)
        return {"ok": False, "error": str(exc)}
