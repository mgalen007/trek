"""In-memory chat history, one conversation per id, owned by one user.

Kept in this process only: restarting the service or running several
instances loses or splits conversations. Fine for a first version; a shared
store (Redis, Postgres) replaces this later without changing callers.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pydantic_ai.messages import ModelMessage


@dataclass
class Conversation:
    id: str
    user_id: str
    messages: list[ModelMessage] = field(default_factory=list)
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class ConversationStore:
    def __init__(self, ttl: timedelta) -> None:
        self._ttl = ttl
        self._conversations: dict[str, Conversation] = {}

    def start(self, user_id: str) -> Conversation:
        self._expire()
        conversation = Conversation(id=str(uuid4()), user_id=user_id)
        self._conversations[conversation.id] = conversation
        return conversation

    def get(self, conversation_id: str, user_id: str) -> Conversation | None:
        """The conversation, if it exists and belongs to this user."""
        self._expire()
        conversation = self._conversations.get(conversation_id)
        if conversation is None or conversation.user_id != user_id:
            return None
        return conversation

    def save(self, conversation: Conversation, messages: list[ModelMessage]) -> None:
        conversation.messages = messages
        conversation.updated_at = datetime.now(UTC)

    def _expire(self) -> None:
        cutoff = datetime.now(UTC) - self._ttl
        for conversation_id in [
            c.id for c in self._conversations.values() if c.updated_at < cutoff
        ]:
            del self._conversations[conversation_id]
