import pytest
from pydantic import ValidationError

from trek_agent.core.config import Settings


def test_rejects_an_empty_api_key_or_model() -> None:
    with pytest.raises(ValidationError, match="must not be empty"):
        Settings(openrouter_api_key="  ", agent_model="openai/gpt-4.1-mini")  # type: ignore[arg-type]
    with pytest.raises(ValidationError, match="must not be empty"):
        Settings(openrouter_api_key="key", agent_model="")  # type: ignore[arg-type]


def test_accepts_real_values() -> None:
    settings = Settings(openrouter_api_key="key", agent_model="openai/gpt-4.1-mini")  # type: ignore[arg-type]

    assert settings.openrouter_api_key.get_secret_value() == "key"
