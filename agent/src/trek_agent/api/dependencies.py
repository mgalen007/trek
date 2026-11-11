"""FastAPI dependencies: how a request gets its token, Trek client and services."""

from typing import Annotated

from fastapi import Depends, Header, Request

from ..clients.trek import TrekClient
from ..core.errors import MissingAgentToken
from ..core.resources import Resources
from ..services.chat_service import ChatService


def get_resources(request: Request) -> Resources:
    return request.app.state.resources


def get_agent_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise MissingAgentToken()
    return authorization.removeprefix("Bearer ")


def get_trek_client(
    resources: Annotated[Resources, Depends(get_resources)],
    token: Annotated[str, Depends(get_agent_token)],
) -> TrekClient:
    """A Trek client acting as the requesting user, with their agent token."""
    return TrekClient(resources.trek_http, token)


def get_chat_service(
    resources: Annotated[Resources, Depends(get_resources)],
    trek: Annotated[TrekClient, Depends(get_trek_client)],
) -> ChatService:
    return ChatService(trek=trek, conversations=resources.conversations, model=resources.model)


ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
