"""Where chat histories are kept.

`ConversationRepository` is the interface the service depends on; the
in-memory version is the only one so far. It lives in this process only, so
a restart loses conversations and several instances don't share them: a
Redis or Postgres repository can replace it without touching callers.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

from pydantic_ai.messages import ModelMessage


@dataclass
class Conversation:
    id: str
    user_id: str
    messages: list[ModelMessage] = field(default_factory=list)
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class ConversationRepository(Protocol):
    async def create(self, user_id: str) -> Conversation: ...

    async def get(self, conversation_id: str) -> Conversation | None: ...

    async def save(self, conversation: Conversation) -> None: ...


class InMemoryConversationRepository:
    """Conversations expire `ttl` after their last message."""

    def __init__(self, ttl: timedelta) -> None:
        self._ttl = ttl
        self._conversations: dict[str, Conversation] = {}

    async def create(self, user_id: str) -> Conversation:
        self._expire()
        conversation = Conversation(id=str(uuid4()), user_id=user_id)
        self._conversations[conversation.id] = conversation
        return conversation

    async def get(self, conversation_id: str) -> Conversation | None:
        self._expire()
        return self._conversations.get(conversation_id)

    async def save(self, conversation: Conversation) -> None:
        conversation.updated_at = datetime.now(UTC)
        self._conversations[conversation.id] = conversation

    def _expire(self) -> None:
        cutoff = datetime.now(UTC) - self._ttl
        expired = [c.id for c in self._conversations.values() if c.updated_at < cutoff]
        for conversation_id in expired:
            del self._conversations[conversation_id]
