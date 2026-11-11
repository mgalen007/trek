from typing import Any

import pytest
from fastapi.testclient import TestClient

from trek_agent.app import create_app
from trek_agent.config import Settings
from trek_agent.tools import TOOLS

from .conftest import TOKEN, FakeTrek, ScriptedModel, call, error, me, ok

AUTH = {"Authorization": f"Bearer {TOKEN}"}

FLIGHT = {
    "id": "flight-1",
    "flightNumber": "SV100",
    "airline": "Savanna Air",
    "departureAirport": {"code": "KGL"},
    "arrivalAirport": {"code": "NBO"},
    "departureAt": "2030-03-01T06:30:00.000Z",
    "arrivalAt": "2030-03-01T08:00:00.000Z",
    "price": "180",
    "currency": "USD",
    "availableSeats": 150,
    "totalSeats": 150,
}


def chat_app(settings: Settings, trek: FakeTrek, script: ScriptedModel) -> TestClient:
    return TestClient(create_app(settings, model=script.model(), trek_transport=trek.transport()))


def test_answers_using_tool_results(settings: Settings, trek: FakeTrek) -> None:
    trek.routes["GET /flights"] = ok([FLIGHT])
    script = ScriptedModel(
        [
            [call("search_flights", from_airport="kgl", to_airport="nbo", date="2030-03-01")],
            "SV100 leaves at 06:30 for 180 USD.",
        ]
    )

    with chat_app(settings, trek, script) as client:
        res = client.post("/chat", headers=AUTH, json={"message": "Kigali to Nairobi on 1 March?"})

    assert res.status_code == 200
    assert res.json()["reply"] == "SV100 leaves at 06:30 for 180 USD."
    [search] = trek.calls("GET", "/flights")
    assert search.url.params["from"] == "KGL"
    assert search.url.params["to"] == "NBO"
    assert search.url.params["date"] == "2030-03-01"
    flights = script.tool_results()["search_flights"]["flights"]
    assert flights[0] == {
        "id": "flight-1",
        "flightNumber": "SV100",
        "airline": "Savanna Air",
        "from": "KGL",
        "to": "NBO",
        "departureAt": "2030-03-01T06:30:00.000Z",
        "arrivalAt": "2030-03-01T08:00:00.000Z",
        "price": "180",
        "currency": "USD",
        "availableSeats": 150,
    }


def test_tool_errors_reach_the_model_with_their_code(settings: Settings, trek: FakeTrek) -> None:
    trek.routes["POST /itineraries/trip-1/hotels"] = error(
        409, "ROOMS_UNAVAILABLE", "Only 0 room(s) left"
    )
    script = ScriptedModel(
        [
            [
                call(
                    "add_hotel_stay",
                    trip_id="trip-1",
                    hotel_id="hotel-1",
                    check_in="2030-03-01",
                    check_out="2030-03-03",
                )
            ],
            "That hotel is full; shall I look for another?",
        ]
    )

    with chat_app(settings, trek, script) as client:
        res = client.post("/chat", headers=AUTH, json={"message": "Add Hill View"})

    assert res.status_code == 200
    assert script.tool_results()["add_hotel_stay"] == {
        "error": {
            "code": "ROOMS_UNAVAILABLE",
            "message": "Only 0 room(s) left",
            "details": None,
        }
    }
    # Creating sends an Idempotency-Key, so the client's retries are safe.
    [post] = trek.calls("POST", "/itineraries/trip-1/hotels")
    assert post.headers["Idempotency-Key"]


def test_continues_a_conversation(settings: Settings, trek: FakeTrek) -> None:
    script = ScriptedModel(["Where to?", "Paris it is."])

    with chat_app(settings, trek, script) as client:
        first = client.post("/chat", headers=AUTH, json={"message": "Plan a trip"}).json()
        client.post(
            "/chat",
            headers=AUTH,
            json={"message": "Paris", "conversation_id": first["conversation_id"]},
        )

    # The second call saw the first exchange.
    assert len(script.seen[1]) > len(script.seen[0])


def test_requires_an_agent_token(settings: Settings, trek: FakeTrek) -> None:
    with chat_app(settings, trek, ScriptedModel([])) as client:
        assert client.post("/chat", json={"message": "hi"}).status_code == 401


def test_rejected_tokens_get_401_so_the_web_app_fetches_a_new_one(
    settings: Settings, trek: FakeTrek
) -> None:
    trek.routes["GET /auth/me"] = error(401, "UNAUTHORIZED")

    with chat_app(settings, trek, ScriptedModel([])) as client:
        res = client.post("/chat", headers=AUTH, json={"message": "hi"})

    assert res.status_code == 401


def test_conversations_belong_to_one_user(settings: Settings, trek: FakeTrek) -> None:
    users = iter([me("user-ada"), me("user-bob")])
    trek.routes["GET /auth/me"] = (200, lambda _: {"data": next(users)})

    with chat_app(settings, trek, ScriptedModel(["Hello Ada"])) as client:
        ada = client.post("/chat", headers=AUTH, json={"message": "hi"}).json()
        bob = client.post(
            "/chat",
            headers=AUTH,
            json={"message": "hi", "conversation_id": ada["conversation_id"]},
        )

    assert bob.status_code == 404


def test_validates_the_message(settings: Settings, trek: FakeTrek) -> None:
    with chat_app(settings, trek, ScriptedModel([])) as client:
        assert client.post("/chat", headers=AUTH, json={"message": ""}).status_code == 422


def test_has_no_tool_that_books_cancels_or_touches_the_account() -> None:
    names = {tool.__name__ for tool in TOOLS}

    assert not {
        n for n in names if any(w in n for w in ("confirm", "cancel", "password", "account"))
    }


@pytest.mark.parametrize("tool", TOOLS, ids=lambda t: t.__name__)
def test_every_tool_is_documented(tool: Any) -> None:
    # The docstring is the tool description the model reads.
    assert tool.__doc__ and len(tool.__doc__.strip()) > 20
