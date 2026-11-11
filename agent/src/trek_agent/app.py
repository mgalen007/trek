"""Composition root: builds the app from its parts. No routes or logic here."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from pydantic_ai.models import Model

from .api import api_router
from .api.error_handlers import register_error_handlers
from .core.config import Settings, get_settings
from .core.resources import open_resources


def create_app(
    settings: Settings | None = None,
    model: Model | None = None,
    trek_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """`model` and `trek_transport` replace OpenRouter and the Trek API, for tests."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with open_resources(settings or get_settings(), model, trek_transport) as resources:
            app.state.resources = resources
            yield

    app = FastAPI(title="Trek agent", lifespan=lifespan)
    register_error_handlers(app)
    app.include_router(api_router)
    return app
