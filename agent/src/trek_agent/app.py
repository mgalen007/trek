"""HTTP API for the web app: one chat endpoint, authenticated by the user's
agent token (from Trek's POST /api/auth/agent-token)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.models import Model
from pydantic_ai.usage import UsageLimits

from .agent import build_model, trek_agent
from .config import Settings, get_settings
from .conversations import ConversationStore
from .tools import TrekDeps
from .trek_client import AgentTokenRejected, TrekApiError, TrekClient

# Caps model calls per chat message, so a confused model can't loop (and
# spend) forever. Planning a whole trip takes well under this.
USAGE_LIMITS = UsageLimits(request_limit=30, tool_calls_limit=60)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    # Omit to start a new conversation; send the returned id to continue it.
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str


def create_app(
    settings: Settings | None = None,
    model: Model | None = None,
    trek_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """`model` and `trek_transport` replace OpenRouter and the Trek API, for tests."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        config = settings or get_settings()
        async with httpx.AsyncClient(
            base_url=config.trek_api_url, timeout=30, transport=trek_transport
        ) as http:
            app.state.http = http
            app.state.model = model or build_model(config)
            app.state.conversations = ConversationStore(
                timedelta(minutes=config.conversation_ttl_minutes)
            )
            yield

    app = FastAPI(title="Trek agent", lifespan=lifespan)

    async def trek_client(
        request: Request, authorization: Annotated[str | None, Header()] = None
    ) -> TrekClient:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Send the user's agent token as a Bearer token")
        return TrekClient(request.app.state.http, authorization[len("Bearer ") :])

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/chat")
    async def chat(
        body: ChatRequest,
        request: Request,
        client: Annotated[TrekClient, Depends(trek_client)],
    ) -> ChatResponse:
        state = request.app.state
        try:
            # Checks the token and tells us whose conversation this is.
            me = await client.get("/auth/me")
        except AgentTokenRejected as err:
            raise HTTPException(401, "Agent token rejected; get a new one") from err
        except TrekApiError as err:
            raise HTTPException(502, f"Trek API error: {err.code}") from err

        conversations: ConversationStore = state.conversations
        if body.conversation_id:
            conversation = conversations.get(body.conversation_id, me["id"])
            if conversation is None:
                raise HTTPException(404, "Conversation not found")
        else:
            conversation = conversations.start(me["id"])

        try:
            result = await trek_agent.run(
                body.message,
                model=state.model,
                deps=TrekDeps(client=client, today=datetime.now(UTC).date()),
                message_history=conversation.messages,
                usage_limits=USAGE_LIMITS,
            )
        except AgentTokenRejected as err:
            # Expired mid-conversation: the history so far is kept.
            raise HTTPException(401, "Agent token rejected; get a new one") from err
        except UsageLimitExceeded as err:
            raise HTTPException(
                422, "The assistant needed too many steps; try a more specific request"
            ) from err

        conversations.save(conversation, result.all_messages())
        return ChatResponse(conversation_id=conversation.id, reply=result.output)

    return app
