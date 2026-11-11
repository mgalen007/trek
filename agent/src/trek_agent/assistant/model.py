from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from ..core.config import Settings


def build_model(settings: Settings) -> OpenAIChatModel:
    """The chat model on OpenRouter, through its OpenAI-compatible API."""
    return OpenAIChatModel(
        settings.agent_model,
        provider=OpenAIProvider(
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key.get_secret_value(),
        ),
    )
