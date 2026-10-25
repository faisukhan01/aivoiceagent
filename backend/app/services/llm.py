"""LLM provider abstraction: OpenAI / Anthropic / Google Gemini.

Selected automatically by whichever API keys are configured (explicit override
supported). Tool calling and streaming are wired through and ready to use.
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings


class AiNotConfiguredError(RuntimeError):
    """Raised when no LLM provider API key is configured."""


@dataclass
class ChatMessage:
    role: str
    content: str


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    raw: Any = field(default=None, repr=False)


def available_providers() -> dict[str, bool]:
    return {
        "openai": settings.has_openai,
        "anthropic": settings.has_anthropic,
        "google": settings.has_google,
    }


def resolve_provider(preferred: str | None = None) -> str:
    """Pick a provider: explicit override first, then any configured key."""
    if preferred:
        if preferred not in ("openai", "anthropic", "google"):
            raise ValueError(f"Unknown provider: {preferred}")
        if not available_providers()[preferred]:
            raise AiNotConfiguredError(
                f"Provider '{preferred}' requested but its API key is not configured."
            )
        return preferred
    for name, ok in available_providers().items():
        if ok:
            return name
    raise AiNotConfiguredError(
        "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY."
    )


DEFAULT_MODELS = {
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "anthropic": os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
    "google": os.getenv("GOOGLE_MODEL", "gemini-2.0-flash"),
}


async def chat(
    messages: list[ChatMessage],
    provider: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    system: str | None = None,
) -> LLMResult:
    """One-shot chat completion with tool-calling passthrough."""
    name = resolve_provider(provider)
    if name == "openai":
        return await _chat_openai(messages, tools, system)
    if name == "anthropic":
        return await _chat_anthropic(messages, tools, system)
    return await _chat_google(messages, tools, system)


async def stream_chat(
    messages: list[ChatMessage],
    provider: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    system: str | None = None,
) -> AsyncIterator[str]:
    """Yield text deltas as they arrive (SSE-friendly)."""
    name = resolve_provider(provider)
    if name == "openai":
        async for delta in _stream_openai(messages, tools, system):
            yield delta
    elif name == "anthropic":
        async for delta in _stream_anthropic(messages, tools, system):
            yield delta
    else:
        async for delta in _stream_google(messages, tools, system):
            yield delta


# ---------------------------------------------------------------- OpenAI ----
async def _chat_openai(messages: list[ChatMessage], tools: list[dict[str, Any]] | None, system: str | None) -> LLMResult:
    from openai import AsyncOpenAI  # lazy import

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    msgs = ([{"role": "system", "content": system}] if system else []) + [
        {"role": m.role, "content": m.content} for m in messages
    ]
    kwargs: dict[str, Any] = {"model": DEFAULT_MODELS["openai"], "messages": msgs}
    if tools:
        kwargs["tools"] = tools
    resp = await client.chat.completions.create(**kwargs)
    return LLMResult(
        text=resp.choices[0].message.content or "",
        provider="openai",
        model=resp.model,
        raw=resp,
    )


async def _stream_openai(messages: list[ChatMessage], tools: list[dict[str, Any]] | None, system: str | None) -> AsyncIterator[str]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    msgs = ([{"role": "system", "content": system}] if system else []) + [
        {"role": m.role, "content": m.content} for m in messages
    ]
    kwargs: dict[str, Any] = {"model": DEFAULT_MODELS["openai"], "messages": msgs, "stream": True}
    if tools:
        kwargs["tools"] = tools
    stream = await client.chat.completions.create(**kwargs)
    async for event in stream:
        delta = event.choices[0].delta.content
        if delta:
            yield delta


# ------------------------------------------------------------- Anthropic ----
async def _chat_anthropic(messages: list[ChatMessage], tools: list[dict[str, Any]] | None, system: str | None) -> LLMResult:
    import anthropic  # lazy import

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    kwargs: dict[str, Any] = {
        "model": DEFAULT_MODELS["anthropic"],
        "max_tokens": 1024,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
    }
    if system:
        kwargs["system"] = system
    if tools:
        kwargs["tools"] = tools
    resp = await client.messages.create(**kwargs)
    text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
    return LLMResult(text=text, provider="anthropic", model=resp.model, raw=resp)


async def _stream_anthropic(messages: list[ChatMessage], tools: list[dict[str, Any]] | None, system: str | None) -> AsyncIterator[str]:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    kwargs: dict[str, Any] = {
        "model": DEFAULT_MODELS["anthropic"],
        "max_tokens": 1024,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
        "stream": True,
    }
    if system:
        kwargs["system"] = system
    if tools:
        kwargs["tools"] = tools
    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text


# ----------------------------------------------------------------- Google ----
async def _chat_google(messages: list[ChatMessage], tools: list[dict[str, Any]] | None, system: str | None) -> LLMResult:
    from google import genai  # lazy import
    from google.genai import types

    client = genai.Client(api_key=settings.google_api_key)
    contents = [
        types.Content(role="user" if m.role != "assistant" else "model", parts=[types.Part(text=m.content)])
        for m in messages
    ]
    config = types.GenerateContentConfig(system_instruction=system, tools=tools or None)
    resp = await client.aio.models.generate_content(
        model=DEFAULT_MODELS["google"], contents=contents, config=config
    )
    return LLMResult(text=resp.text or "", provider="google", model=DEFAULT_MODELS["google"], raw=resp)


async def _stream_google(messages: list[ChatMessage], tools: list[dict[str, Any]] | None, system: str | None) -> AsyncIterator[str]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.google_api_key)
    contents = [
        types.Content(role="user" if m.role != "assistant" else "model", parts=[types.Part(text=m.content)])
        for m in messages
    ]
    config = types.GenerateContentConfig(system_instruction=system, tools=tools or None)
    async for chunk in client.aio.models.generate_content_stream(
        model=DEFAULT_MODELS["google"], contents=contents, config=config
    ):
        if chunk.text:
            yield chunk.text


def dumps(obj: Any) -> str:
    """JSON helper for SSE frames."""
    return json.dumps(obj, ensure_ascii=False)
