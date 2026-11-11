"""The chat flow: who is asking, which conversation, run the assistant, save."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.models import Model

from ..assistant import USAGE_LIMITS, TrekDeps, trek_agent
from ..clients.trek import AgentTokenRejected, TrekApiError, TrekClient
from ..core.errors import (
    ConversationNotFound,
    InvalidAgentToken,
    StepLimitReached,
    TrekUnavailable,
)
from ..repositories import Conversation, ConversationRepository


@dataclass
class ChatReply:
    conversation_id: str
    reply: str


def utc_today() -> date:
    return datetime.now(UTC).date()


class ChatService:
    """One instance per request: `trek` acts with that request's agent token."""

    def __init__(
        self,
        trek: TrekClient,
        conversations: ConversationRepository,
        model: Model,
        today: Callable[[], date] = utc_today,
    ) -> None:
        self._trek = trek
        self._conversations = conversations
        self._model = model
        self._today = today

    async def chat(self, message: str, conversation_id: str | None = None) -> ChatReply:
        user_id = await self._current_user_id()
        conversation = await self._conversation_for(user_id, conversation_id)

        try:
            result = await trek_agent.run(
                message,
                model=self._model,
                deps=TrekDeps(client=self._trek, today=self._today()),
                message_history=conversation.messages,
                usage_limits=USAGE_LIMITS,
            )
        except AgentTokenRejected as err:
            # Expired mid-conversation: the history so far is kept.
            raise InvalidAgentToken() from err
        except UsageLimitExceeded as err:
            raise StepLimitReached() from err

        conversation.messages = result.all_messages()
        await self._conversations.save(conversation)
        return ChatReply(conversation_id=conversation.id, reply=result.output)

    async def _current_user_id(self) -> str:
        """Also checks the agent token before any model call is paid for."""
        try:
            me = await self._trek.get("/auth/me")
        except AgentTokenRejected as err:
            raise InvalidAgentToken() from err
        except TrekApiError as err:
            raise TrekUnavailable(f"Trek API error: {err.code}") from err
        return me["id"]

    async def _conversation_for(self, user_id: str, conversation_id: str | None) -> Conversation:
        if conversation_id is None:
            return await self._conversations.create(user_id)
        conversation = await self._conversations.get(conversation_id)
        # Someone else's conversation is reported as missing, not forbidden.
        if conversation is None or conversation.user_id != user_id:
            raise ConversationNotFound()
        return conversation
