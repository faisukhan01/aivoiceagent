"""Application settings loaded from environment / .env via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration. Every integration degrades gracefully when a key is absent."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- LLM providers ----
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""

    # ---- Voice ----
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # ---- Database (Turso / libSQL) ----
    turso_database_url: str = ""
    turso_auth_token: str = ""

    # ---- Monitoring ----
    sentry_dsn: str = ""

    # ---- Server ----
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # ---- Helpers ----
    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_google(self) -> bool:
        return bool(self.google_api_key)

    @property
    def has_elevenlabs(self) -> bool:
        return bool(self.elevenlabs_api_key)

    @property
    def has_livekit(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)

    @property
    def has_turso(self) -> bool:
        return bool(self.turso_database_url)

    @property
    def has_any_llm_key(self) -> bool:
        return self.has_openai or self.has_anthropic or self.has_google


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
