"""Long-lived objects shared by every request, opened and closed with the app."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import timedelta

import httpx
from pydantic_ai.models import Model

from ..assistant import build_model
from ..repositories import ConversationRepository, InMemoryConversationRepository
from .config import Settings


@dataclass
class Resources:
    trek_http: httpx.AsyncClient
    model: Model
    conversations: ConversationRepository


@asynccontextmanager
async def open_resources(
    settings: Settings,
    model: Model | None = None,
    trek_transport: httpx.AsyncBaseTransport | None = None,
) -> AsyncIterator[Resources]:
    """`model` and `trek_transport` replace OpenRouter and the Trek API, for tests."""
    async with httpx.AsyncClient(
        base_url=settings.trek_api_url, timeout=30, transport=trek_transport
    ) as trek_http:
        yield Resources(
            trek_http=trek_http,
            model=model or build_model(settings),
            conversations=InMemoryConversationRepository(
                timedelta(minutes=settings.conversation_ttl_minutes)
            ),
        )
