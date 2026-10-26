"""Turso (libSQL) connection helpers.

Uses `libsql-experimental` for remote libSQL/Turso URLs (libsql://, https://)
and falls back to a local SQLite file so the API works offline during dev.
Turso's native vector search can be layered on when production creds arrive.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any

from app.core.config import settings

_LOCAL_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "local.db")


def is_remote() -> bool:
    return settings.turso_database_url.startswith(("libsql://", "https://", "http://", "wss://"))


def get_conn():
    """Return a DBAPI-style connection (remote Turso or local SQLite)."""
    if is_remote():
        import libsql_experimental as libsql  # lazy import

        return libsql.connect(
            settings.turso_database_url,
            auth_token=settings.turso_auth_token or None,
        )
    return sqlite3.connect(_LOCAL_DB)


def check_connection() -> dict[str, Any]:
    """Health probe used by /health."""
    try:
        conn = get_conn()
        conn.execute("SELECT 1")  # type: ignore[attr-defined]
        return {"ok": True, "mode": "turso" if is_remote() else "local-sqlite", "path": None if is_remote() else _LOCAL_DB}
    except Exception as exc:  # pragma: no cover - report-only
        return {"ok": False, "mode": "turso" if is_remote() else "local-sqlite", "error": str(exc)}
