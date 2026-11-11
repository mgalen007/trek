import httpx
import pytest

from trek_agent.clients.trek import AgentTokenRejected, TrekApiError, TrekClient
from trek_agent.clients.trek import client as trek_client

from ..fakes import TOKEN, TREK_URL, FakeTrek, error, ok

pytestmark = pytest.mark.anyio


def client_for(trek: FakeTrek) -> TrekClient:
    http = httpx.AsyncClient(base_url=TREK_URL, transport=trek.transport())
    return TrekClient(http, TOKEN)


async def test_returns_data_and_sends_the_token(trek: FakeTrek) -> None:
    trek.routes["GET /flights"] = ok([{"id": "f1"}])

    data = await client_for(trek).get("/flights", **{"from": "KGL"}, maxPrice=None)

    assert data == [{"id": "f1"}]
    [request] = trek.calls("GET", "/flights")
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    # None-valued filters aren't sent.
    assert dict(request.url.params) == {"from": "KGL"}


async def test_raises_the_api_error_code(trek: FakeTrek) -> None:
    trek.routes["POST /itineraries/t1/hotels"] = error(409, "ROOMS_UNAVAILABLE")

    with pytest.raises(TrekApiError) as caught:
        await client_for(trek).post("/itineraries/t1/hotels", {"rooms": 9})

    assert (caught.value.status, caught.value.code) == (409, "ROOMS_UNAVAILABLE")


async def test_a_rejected_token_has_its_own_error(trek: FakeTrek) -> None:
    trek.routes["GET /auth/me"] = error(401, "UNAUTHORIZED")

    with pytest.raises(AgentTokenRejected):
        await client_for(trek).get("/auth/me")


async def test_retries_a_network_failure_with_the_same_idempotency_key() -> None:
    keys: list[str] = []

    def flaky(request: httpx.Request) -> httpx.Response:
        keys.append(request.headers["Idempotency-Key"])
        if len(keys) == 1:
            raise httpx.ConnectError("dropped")
        return httpx.Response(201, json={"data": {"id": "trip"}})

    http = httpx.AsyncClient(base_url=TREK_URL, transport=httpx.MockTransport(flaky))
    data = await TrekClient(http, TOKEN).post("/itineraries", {"name": "Trip"})

    assert data == {"id": "trip"}
    assert len(keys) == 2 and keys[0] == keys[1]


async def test_waits_out_rate_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    waits: list[float] = []

    async def no_sleep(seconds: float) -> None:
        waits.append(seconds)

    monkeypatch.setattr(trek_client.asyncio, "sleep", no_sleep)
    answers = iter(
        [
            httpx.Response(
                429,
                headers={"Retry-After": "3"},
                json={
                    "statusCode": 429,
                    "error": {"code": "TOO_MANY_REQUESTS", "message": "slow down"},
                },
            ),
            httpx.Response(200, json={"data": []}),
        ]
    )
    http = httpx.AsyncClient(
        base_url=TREK_URL, transport=httpx.MockTransport(lambda _: next(answers))
    )

    assert await TrekClient(http, TOKEN).get("/hotels") == []
    assert waits == [3.0]
