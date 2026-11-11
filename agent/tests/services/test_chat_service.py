"""The chat flow, without HTTP: a scripted model, a fake Trek, in-memory storage."""

from datetime import date, timedelta

import pytest

from trek_agent.clients.trek import TrekClient
from trek_agent.core.errors import (
    ConversationNotFound,
    InvalidAgentToken,
    StepLimitReached,
    TrekUnavailable,
)
from trek_agent.repositories import InMemoryConversationRepository
from trek_agent.services import ChatService

from ..fakes import TOKEN, FakeTrek, ScriptedModel, call, error, me, ok

pytestmark = pytest.mark.anyio

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


def service_for(
    trek: FakeTrek,
    script: ScriptedModel,
    conversations: InMemoryConversationRepository | None = None,
) -> ChatService:
    return ChatService(
        trek=TrekClient(trek.http(), TOKEN),
        conversations=conversations or InMemoryConversationRepository(timedelta(hours=1)),
        model=script.model(),
        today=lambda: date(2030, 2, 1),
    )


async def test_answers_using_tool_results(trek: FakeTrek) -> None:
    trek.routes["GET /flights"] = ok([FLIGHT])
    script = ScriptedModel(
        [
            [call("search_flights", from_airport="kgl", to_airport="nbo", date="2030-03-01")],
            "SV100 leaves at 06:30 for 180 USD.",
        ]
    )

    result = await service_for(trek, script).chat("Kigali to Nairobi on 1 March?")

    assert result.reply == "SV100 leaves at 06:30 for 180 USD."
    [search] = trek.calls("GET", "/flights")
    assert dict(search.url.params) == {
        "from": "KGL",
        "to": "NBO",
        "date": "2030-03-01",
        "passengers": "1",
        "sort": "price",
        "order": "asc",
        "limit": "10",
    }
    [flight] = script.tool_results()["search_flights"]["flights"]
    assert flight["flightNumber"] == "SV100"
    assert (flight["from"], flight["to"]) == ("KGL", "NBO")


async def test_gives_the_model_todays_date(trek: FakeTrek) -> None:
    script = ScriptedModel(["Hello"])

    await service_for(trek, script).chat("hi")

    first_request = script.seen[0][0]
    assert "Today is 2030-02-01 (UTC)." in (first_request.instructions or "")


async def test_tool_errors_reach_the_model_with_their_code(trek: FakeTrek) -> None:
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

    await service_for(trek, script).chat("Add Hill View")

    assert script.tool_results()["add_hotel_stay"] == {
        "error": {"code": "ROOMS_UNAVAILABLE", "message": "Only 0 room(s) left", "details": None}
    }
    # Creating sends an Idempotency-Key, so the client's retries are safe.
    [post] = trek.calls("POST", "/itineraries/trip-1/hotels")
    assert post.headers["Idempotency-Key"]


async def test_continues_a_conversation_with_its_history(trek: FakeTrek) -> None:
    script = ScriptedModel(["Where to?", "Paris it is."])
    service = service_for(trek, script)

    first = await service.chat("Plan a trip")
    second = await service.chat("Paris", first.conversation_id)

    assert second.conversation_id == first.conversation_id
    assert len(script.seen[1]) > len(script.seen[0])


async def test_another_users_conversation_is_not_found(trek: FakeTrek) -> None:
    conversations = InMemoryConversationRepository(timedelta(hours=1))
    ada = await service_for(trek, ScriptedModel(["Hi Ada"]), conversations).chat("hi")

    trek.routes["GET /auth/me"] = ok(me("user-bob"))
    with pytest.raises(ConversationNotFound):
        await service_for(trek, ScriptedModel([]), conversations).chat("hi", ada.conversation_id)


async def test_a_rejected_token_stops_before_any_model_call(trek: FakeTrek) -> None:
    trek.routes["GET /auth/me"] = error(401, "UNAUTHORIZED")
    script = ScriptedModel([])

    with pytest.raises(InvalidAgentToken):
        await service_for(trek, script).chat("hi")
    assert script.seen == []


async def test_a_token_expiring_mid_run_is_reported(trek: FakeTrek) -> None:
    trek.routes["GET /flights"] = error(401, "UNAUTHORIZED")
    script = ScriptedModel(
        [[call("search_flights", from_airport="KGL", to_airport="NBO", date="2030-03-01")]]
    )

    with pytest.raises(InvalidAgentToken):
        await service_for(trek, script).chat("flights?")


async def test_trek_failures_are_reported(trek: FakeTrek) -> None:
    trek.routes["GET /auth/me"] = error(500, "INTERNAL_ERROR")

    with pytest.raises(TrekUnavailable):
        await service_for(trek, ScriptedModel([])).chat("hi")


async def test_stops_a_model_that_loops(trek: FakeTrek) -> None:
    trek.routes["GET /travelers"] = ok([])
    trek.routes["GET /users/me/preferences"] = ok({"defaultTravelers": 1})
    script = ScriptedModel([[call("get_user_context")]] * 100)

    with pytest.raises(StepLimitReached):
        await service_for(trek, script).chat("hi")
