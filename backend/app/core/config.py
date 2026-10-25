"""Application settings loaded from environment / .env file.

Uses pydantic-settings so every value can be overridden via environment
variables. All provider keys are optional — the app must boot cleanly with
zero keys configured (feature flags in /health reflect what is available).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central, typed application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # LLM providers
    # ------------------------------------------------------------------ #
    OPENAI_API_KEY: str | None = Field(default=None, description="OpenAI API key")
    ANTHROPIC_API_KEY: str | None = Field(default=None, description="Anthropic API key")
    GOOGLE_API_KEY: str | None = Field(
        default=None, description="Google AI (Gemini) API key"
    )

    # ------------------------------------------------------------------ #
    # Voice providers
    # ------------------------------------------------------------------ #
    ELEVENLABS_API_KEY: str | None = Field(
        default=None, description="ElevenLabs API key for TTS/STT"
    )
    ELEVENLABS_VOICE_ID: str = Field(
        default="21m00Tcm4TlvDq8ikWAM",
        description="Default ElevenLabs voice id (Rachel)",
    )

    # ------------------------------------------------------------------ #
    # Realtime transport
    # ------------------------------------------------------------------ #
    LIVEKIT_URL: str | None = Field(default=None, description="LiveKit server URL")
    LIVEKIT_API_KEY: str | None = Field(default=None, description="LiveKit API key")
    LIVEKIT_API_SECRET: str | None = Field(
        default=None, description="LiveKit API secret"
    )

    # ------------------------------------------------------------------ #
    # Storage
    # ------------------------------------------------------------------ #
    TURSO_DATABASE_URL: str | None = Field(
        default=None, description="Turso/libsql database URL (libsql://...)"
    )
    TURSO_AUTH_TOKEN: str | None = Field(
        default=None, description="Turso auth token"
    )

    # ------------------------------------------------------------------ #
    # Observability
    # ------------------------------------------------------------------ #
    SENTRY_DSN: str | None = Field(
        default=None, description="Sentry DSN (sentry-sdk not installed by default)"
    )

    # ------------------------------------------------------------------ #
    # Server
    # ------------------------------------------------------------------ #
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # ------------------------------------------------------------------ #
    # Helpers — feature detection
    # ------------------------------------------------------------------ #

    def _has(self, value: str | None) -> bool:
        """True when a config value is set and non-blank."""
        return bool(value and value.strip())

    @property
    def has_openai(self) -> bool:
        """OpenAI key configured."""
        return self._has(self.OPENAI_API_KEY)

    @property
    def has_anthropic(self) -> bool:
        """Anthropic key configured."""
        return self._has(self.ANTHROPIC_API_KEY)

    @property
    def has_google(self) -> bool:
        """Google (Gemini) key configured."""
        return self._has(self.GOOGLE_API_KEY)

    @property
    def has_elevenlabs(self) -> bool:
        """ElevenLabs key configured."""
        return self._has(self.ELEVENLABS_API_KEY)

    @property
    def has_livekit(self) -> bool:
        """LiveKit fully configured (URL + key + secret)."""
        return all(
            self._has(v)
            for v in (self.LIVEKIT_URL, self.LIVEKIT_API_KEY, self.LIVEKIT_API_SECRET)
        )

    @property
    def has_any_llm_key(self) -> bool:
        """At least one LLM provider key is configured."""
        return (
            self.has_openai
            or self.has_anthropic
            or self.has_google
        )

    @property
    def has_embedding_provider(self) -> bool:
        """A provider usable for text embeddings is configured."""
        return self.has_openai or self.has_google

    @property
    def turso_configured(self) -> bool:
        """Turso database URL configured."""
        return self._has(self.TURSO_DATABASE_URL)

    def provider_flags(self) -> dict[str, bool]:
        """Boolean map of provider availability, used by /health."""
        return {
            "openai": self.has_openai,
            "anthropic": self.has_anthropic,
            "google": self.has_google,
            "elevenlabs": self.has_elevenlabs,
            "livekit": self.has_livekit,
        }

    def to_safe_dict(self) -> dict[str, Any]:
        """Settings summary without leaking secrets (values replaced by bools)."""
        return {
            "providers": self.provider_flags(),
            "turso_configured": self.turso_configured,
            "sentry_configured": self._has(self.SENTRY_DSN),
            "app_host": self.APP_HOST,
            "app_port": self.APP_PORT,
        }


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (import-safe, cheap to call repeatedly)."""
    return Settings()


settings = get_settings()
