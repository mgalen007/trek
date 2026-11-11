from datetime import UTC, datetime, timedelta

import pytest

from trek_agent.repositories import InMemoryConversationRepository

pytestmark = pytest.mark.anyio


async def test_stores_and_returns_conversations() -> None:
    repo = InMemoryConversationRepository(timedelta(hours=1))

    conversation = await repo.create("user-ada")
    await repo.save(conversation)

    assert await repo.get(conversation.id) is conversation
    assert conversation.user_id == "user-ada"
    assert await repo.get("unknown") is None


async def test_forgets_idle_conversations() -> None:
    repo = InMemoryConversationRepository(timedelta(minutes=30))
    idle = await repo.create("user-ada")
    idle.updated_at = datetime.now(UTC) - timedelta(minutes=31)
    fresh = await repo.create("user-ada")

    assert await repo.get(idle.id) is None
    assert await repo.get(fresh.id) is fresh
