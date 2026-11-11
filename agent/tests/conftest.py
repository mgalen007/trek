import pytest

from trek_agent.core.config import Settings

from .fakes import TREK_URL, FakeTrek, me, ok


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def trek() -> FakeTrek:
    return FakeTrek(routes={"GET /auth/me": ok(me())})


@pytest.fixture
def settings() -> Settings:
    return Settings(
        trek_api_url=TREK_URL,
        openrouter_api_key="test-key",  # type: ignore[arg-type]
        agent_model="test/model",
    )
