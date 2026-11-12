"""FastAPI dependencies: how a request gets its token, Trek client and services."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..clients.trek import TrekClient
from ..core.errors import MissingAgentToken
from ..core.resources import Resources
from ..services.chat_service import ChatService

# A security scheme rather than a header parameter: OpenAPI tools (Swagger UI
# included) ignore header parameters named Authorization, so the token would
# never be sent. This also gives the docs an "Authorize" button.
# auto_error=False so a missing token gets our own 401 error body.
agent_token_scheme = HTTPBearer(
    scheme_name="AgentToken",
    description="The user's agent token, from Trek's `POST /api/auth/agent-token`.",
    auto_error=False,
)


def get_resources(request: Request) -> Resources:
    return request.app.state.resources


def get_agent_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(agent_token_scheme)],
) -> str:
    if credentials is None or not credentials.credentials:
        raise MissingAgentToken()
    return credentials.credentials


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
