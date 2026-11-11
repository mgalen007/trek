from functools import lru_cache

from pydantic import SecretStr
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


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
