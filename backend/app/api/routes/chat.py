"""Chat endpoints: non-streaming and SSE streaming completions."""

from __future__ import annotations

import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.llm import AiNotConfiguredError, llm_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    """One conversation turn (OpenAI-style roles)."""

    role: Literal["system", "user", "assistant"] = "user"
    content: str = Field(min_length=0, max_length=32_000)


class ChatRequest(BaseModel):
    """Request body for both chat endpoints."""

    messages: list[ChatMessage] = Field(min_length=1)
    provider: str | None = Field(
        default=None, description='Provider override: "openai"|"anthropic"|"google"'
    )
    model: str | None = Field(default=None, description="Model override")
    system: str | None = Field(default=None, description="System prompt")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class ChatResponse(BaseModel):
    """Non-streaming reply envelope."""

    reply: str
    provider: str | None
    model: str | None
    placeholder: bool = False
    detail: str | None = None


NO_PROVIDER_DETAIL = (
    "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or "
    "GOOGLE_API_KEY in backend/.env (see backend/.env.example)."
)


@router.post("")
async def chat(req: ChatRequest) -> ChatResponse:
    """Synchronous chat completion.

    Degrades gracefully to a structured placeholder when no provider key is
    configured (HTTP 200, ``placeholder: true``) — never a 500.
    """
    try:
        msg = await llm_service.chat(
            [m.model_dump() for m in req.messages],
            provider=req.provider,
            model=req.model,
            system=req.system,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
        return ChatResponse(
            reply=msg.get("content") or "",
            provider=req.provider or (llm_service.available_providers() or [None])[0],
            model=msg.get("model"),
        )
    except AiNotConfiguredError:
        logger.info("Chat requested without configured provider")
        return ChatResponse(
            reply="",
            provider=None,
            model=None,
            placeholder=True,
            detail=NO_PROVIDER_DETAIL,
        )
    except Exception:  # noqa: BLE001 — surface as structured error, not 500
        logger.exception("Chat completion failed")
        return ChatResponse(
            reply="",
            provider=req.provider,
            model=req.model,
            placeholder=True,
            detail="Chat completion failed upstream; check uvicorn logs.",
        )


@router.post("/stream")
async def chat_stream(req: ChatRequest, fmt: str = Query(default="json", alias="format")) -> StreamingResponse:
    """SSE stream of assistant tokens.

    Emits ``data: {"delta": "..."}\\n\\n`` events and a final
    ``data: {"done": true}`` event. When no provider is configured, streams a
    single structured event explaining the situation (still HTTP 200 SSE).
    """
    use_sse = fmt == "sse"  # "json" sends raw newline-delimited deltas; "sse" is event-framed

    def _event(payload: dict[str, Any]) -> bytes:
        line = json.dumps(payload, ensure_ascii=False)
        return f"data: {line}\n\n".encode("utf-8") if use_sse else f"{line}\n".encode("utf-8")

    async def _gen():  # type: ignore[no-untyped-def]
        try:
            async for delta in llm_service.stream_chat(
                [m.model_dump() for m in req.messages],
                provider=req.provider,
                model=req.model,
                system=req.system,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                yield _event({"delta": delta})
            yield _event({"done": True})
        except AiNotConfiguredError:
            yield _event(
                {"delta": "", "placeholder": True, "detail": NO_PROVIDER_DETAIL, "done": True}
            )
        except Exception:  # noqa: BLE001
            logger.exception("Chat stream failed")
            yield _event(
                {"delta": "", "placeholder": True, "detail": "stream failed upstream", "done": True}
            )

    media_type = "text/event-stream" if use_sse else "application/x-ndjson"
    return StreamingResponse(_gen(), media_type=media_type)
