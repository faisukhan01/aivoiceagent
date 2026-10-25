"""LLM provider abstraction.

Chooses a provider automatically based on which API keys are configured
(preference order: OpenAI → Anthropic → Google), or honors an explicit
``provider`` override. Supports non-streaming and streaming chat, and is
tool-calling-ready via a ``tools`` passthrough parameter.

Every provider SDK is imported lazily inside the functions that use it so
the module imports cleanly even when no SDK/key is installed/configured.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any, Literal

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ProviderName = Literal["openai", "anthropic", "google"]

# Default model identifiers per provider (override per-call if desired).
DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "google": "gemini-2.0-flash",
}

Message = dict[str, Any]


class AiNotConfiguredError(RuntimeError):
    """Raised when no LLM provider key is available for the request."""


def _resolve_provider(provider: str | None) -> ProviderName:
    """Pick a provider explicitly, or auto-detect from configured keys."""
    settings = get_settings()
    if provider:
        provider = provider.lower().strip()
        if provider not in DEFAULT_MODELS:
            raise ValueError(
                f"Unknown provider {provider!r}; expected one of {sorted(DEFAULT_MODELS)}"
            )
        return provider  # type: ignore[return-value]
    if settings.has_openai:
        return "openai"
    if settings.has_anthropic:
        return "anthropic"
    if settings.has_google:
        return "google"
    raise AiNotConfiguredError(
        "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY "
        "or GOOGLE_API_KEY in the backend .env file."
    )


class LlmService:
    """Thin async facade over OpenAI / Anthropic / Google GenAI SDKs."""

    name = "llm"

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    async def chat(
        self,
        messages: Sequence[Message],
        *,
        provider: str | None = None,
        model: str | None = None,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        tools: Sequence[dict[str, Any]] | None = None,
    ) -> Message:
        """Non-streaming chat completion. Returns the assistant message dict.

        Args:
            messages: OpenAI-style ``{"role", "content"}`` messages.
            provider: Explicit provider override ("openai"|"anthropic"|"google").
            model: Model override; defaults per provider.
            system: Optional system prompt (applied uniformly across providers).
            temperature: Sampling temperature.
            max_tokens: Max tokens to generate.
            tools: Tool/function schemas passed through to the provider
                (tool-calling-ready; response may include tool_calls).
        """
        resolved = _resolve_provider(provider)
        model = model or DEFAULT_MODELS[resolved]
        logger.info("LLM chat: provider=%s model=%s msgs=%d", resolved, model, len(messages))
        if resolved == "openai":
            return await self._chat_openai(
                messages, model, system, temperature, max_tokens, tools
            )
        if resolved == "anthropic":
            return await self._chat_anthropic(
                messages, model, system, temperature, max_tokens, tools
            )
        return await self._chat_google(
            messages, model, system, temperature, max_tokens
        )

    async def stream_chat(
        self,
        messages: Sequence[Message],
        *,
        provider: str | None = None,
        model: str | None = None,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        tools: Sequence[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        """Streaming chat completion — yields text deltas as they arrive."""
        resolved = _resolve_provider(provider)
        model = model or DEFAULT_MODELS[resolved]
        logger.info("LLM stream: provider=%s model=%s msgs=%d", resolved, model, len(messages))
        if resolved == "openai":
            async for delta in self._stream_openai(
                messages, model, system, temperature, max_tokens, tools
            ):
                yield delta
        elif resolved == "anthropic":
            async for delta in self._stream_anthropic(
                messages, model, system, temperature, max_tokens
            ):
                yield delta
        else:
            async for delta in self._stream_google(
                messages, model, system, temperature, max_tokens
            ):
                yield delta

    def available_providers(self) -> list[str]:
        """Providers with configured API keys, in preference order."""
        settings = get_settings()
        out: list[str] = []
        if settings.has_openai:
            out.append("openai")
        if settings.has_anthropic:
            out.append("anthropic")
        if settings.has_google:
            out.append("google")
        return out

    # ------------------------------------------------------------------ #
    # OpenAI
    # ------------------------------------------------------------------ #

    async def _chat_openai(
        self,
        messages: Sequence[Message],
        model: str,
        system: str | None,
        temperature: float,
        max_tokens: int,
        tools: Sequence[dict[str, Any]] | None,
    ) -> Message:
        from openai import AsyncOpenAI  # lazy import

        client = AsyncOpenAI()
        msgs: list[Message] = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend(messages)
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": msgs,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = list(tools)
        resp = await client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        return {
            "role": "assistant",
            "content": choice.message.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in (choice.message.tool_calls or [])
            ]
            or None,
            "model": resp.model,
        }

    async def _stream_openai(
        self,
        messages: Sequence[Message],
        model: str,
        system: str | None,
        temperature: float,
        max_tokens: int,
        tools: Sequence[dict[str, Any]] | None,
    ) -> AsyncIterator[str]:
        from openai import AsyncOpenAI  # lazy import

        client = AsyncOpenAI()
        msgs: list[Message] = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend(messages)
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": msgs,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if tools:
            kwargs["tools"] = list(tools)
        stream = await client.chat.completions.create(**kwargs)
        async for event in stream:
            if event.choices and event.choices[0].delta.content:
                yield event.choices[0].delta.content

    # ------------------------------------------------------------------ #
    # Anthropic
    # ------------------------------------------------------------------ #

    @staticmethod
    def _anthropic_messages(messages: Sequence[Message]) -> list[Message]:
        """Map OpenAI-style roles to Anthropic's user/assistant-only format."""
        return [
            {
                "role": m["role"] if m["role"] != "assistant" else "assistant",
                "content": m.get("content", ""),
            }
            for m in messages
            if m.get("role") in ("user", "assistant")
        ]

    async def _chat_anthropic(
        self,
        messages: Sequence[Message],
        model: str,
        system: str | None,
        temperature: float,
        max_tokens: int,
        tools: Sequence[dict[str, Any]] | None,
    ) -> Message:
        import anthropic  # lazy import

        client = anthropic.AsyncAnthropic()
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": self._anthropic_messages(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = list(tools)
        resp = await client.messages.create(**kwargs)
        text = "".join(
            block.text for block in resp.content if getattr(block, "type", "") == "text"
        )
        return {
            "role": "assistant",
            "content": text,
            "stop_reason": resp.stop_reason,
            "model": resp.model,
        }

    async def _stream_anthropic(
        self,
        messages: Sequence[Message],
        model: str,
        system: str | None,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[str]:
        import anthropic  # lazy import

        client = anthropic.AsyncAnthropic()
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": self._anthropic_messages(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    # ------------------------------------------------------------------ #
    # Google GenAI
    # ------------------------------------------------------------------ #

    async def _chat_google(
        self,
        messages: Sequence[Message],
        model: str,
        system: str | None,
        temperature: float,
        max_tokens: int,
    ) -> Message:
        from google import genai  # lazy import
        from google.genai import types  # lazy import

        client = genai.Client()
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        contents = [
            types.Content(
                role="model" if m.get("role") == "assistant" else "user",
                parts=[types.Part(text=str(m.get("content", "")))],
            )
            for m in messages
        ]
        resp = await client.aio.models.generate_content(
            model=model, contents=contents, config=config
        )
        return {
            "role": "assistant",
            "content": resp.text,
            "model": model,
        }

    async def _stream_google(
        self,
        messages: Sequence[Message],
        model: str,
        system: str | None,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[str]:
        from google import genai  # lazy import
        from google.genai import types  # lazy import

        client = genai.Client()
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        contents = [
            types.Content(
                role="model" if m.get("role") == "assistant" else "user",
                parts=[types.Part(text=str(m.get("content", "")))],
            )
            for m in messages
        ]
        async for chunk in client.aio.models.generate_content_stream(
            model=model, contents=contents, config=config
        ):
            if chunk.text:
                yield chunk.text


def dumps(obj: Any) -> str:
    """Compact JSON helper for SSE payloads."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


llm_service = LlmService()
"""Module-level singleton used by the API routes."""
