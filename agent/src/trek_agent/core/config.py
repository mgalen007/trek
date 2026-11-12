from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration from the environment, or agent/.env in development."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Where the Trek API lives, including the /api prefix.
    trek_api_url: str = "http://localhost:3000/api"

    # OpenRouter speaks the OpenAI API; only the base URL differs.
    openrouter_api_key: SecretStr
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # OpenRouter model id, e.g. "openai/gpt-4.1-mini" or "anthropic/claude-sonnet-4".
    agent_model: str

    # Conversations are kept in memory for this long after their last message.
    conversation_ttl_minutes: int = 120

    # Browser origins allowed to call the agent, comma-separated (e.g. the
    # web app's http://localhost:5173). CORS is off when empty.
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Fail at startup, not on the first chat, when these are set but empty
    # (easy to get from an unfilled .env or a compose variable).
    @field_validator("openrouter_api_key", "agent_model")
    @classmethod
    def not_blank[T: (str, SecretStr)](cls, value: T) -> T:
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if not raw.strip():
            raise ValueError("must not be empty (set it in agent/.env)")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
