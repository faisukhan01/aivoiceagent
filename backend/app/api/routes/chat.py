"""Chat endpoints: one-shot and streaming (SSE) completions with tool-calling passthrough."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services import llm
from app.services.llm import AiNotConfiguredError, ChatMessage

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    provider: str | None = None
    system: str | None = None
    tools: list[dict[str, Any]] | None = None


@router.post("")
async def chat(req: ChatRequest) -> dict[str, Any]:
    try:
        result = await llm.chat(req.messages, provider=req.provider, tools=req.tools, system=req.system)
    except AiNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"text": result.text, "provider": result.provider, "model": result.model}


@router.post("/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    async def sse() -> AsyncIterator[str]:
        try:
            async for delta in llm.stream_chat(req.messages, provider=req.provider, tools=req.tools, system=req.system):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except AiNotConfiguredError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")
