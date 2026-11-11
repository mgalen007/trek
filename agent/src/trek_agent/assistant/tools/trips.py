from datetime import date
from typing import Any, Literal

from pydantic_ai import RunContext

from ..deps import TrekDeps
from . import presenters
from .errors import Result, reports_errors


@reports_errors
async def list_trips(
    ctx: RunContext[TrekDeps],
    status: Literal["DRAFT", "PLANNED", "CANCELLED", "COMPLETED"] | None = None,
) -> Result:
    """The user's trips, soonest first, optionally only those in one status."""
    trips = await ctx.deps.client.get("/itineraries", status=status, limit=20)
    return {"trips": [presenters.trip_summary(t) for t in trips]}


@reports_errors
async def get_trip(ctx: RunContext[TrekDeps], trip_id: str) -> Result:
    """A trip with its hotel stays, flights and totals (prices as added)."""
    return presenters.trip(await ctx.deps.client.get(f"/itineraries/{trip_id}"))


@reports_errors
async def create_draft_trip(
    ctx: RunContext[TrekDeps],
    name: str,
    destination_id: str,
    start_date: date,
    end_date: date,
) -> Result:
    """Start an empty draft trip. Add hotel stays and flights to it next.

    Args:
        name: a short title, e.g. "Kigali in March".
        destination_id: from search_destinations.
        start_date: first day of the trip (today or later).
        end_date: last day of the trip.
    """
    trip = await ctx.deps.client.post(
        "/itineraries",
        {
            "name": name,
            "destinationId": destination_id,
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
        },
    )
    return presenters.trip(trip)


@reports_errors
async def update_draft_trip(
    ctx: RunContext[TrekDeps],
    trip_id: str,
    name: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Result:
    """Rename or re-date a draft. Existing stays and flights must still fit."""
    body = {
        "name": name,
        "startDate": start_date.isoformat() if start_date else None,
        "endDate": end_date.isoformat() if end_date else None,
    }
    trip = await ctx.deps.client.put(
        f"/itineraries/{trip_id}", {k: v for k, v in body.items() if v is not None}
    )
    return presenters.trip(trip)


@reports_errors
async def delete_draft_trip(ctx: RunContext[TrekDeps], trip_id: str) -> Result:
    """Delete a draft trip. Only do this when the user asks to."""
    await ctx.deps.client.delete(f"/itineraries/{trip_id}")
    return {"deleted": trip_id}


@reports_errors
async def add_hotel_stay(
    ctx: RunContext[TrekDeps],
    trip_id: str,
    hotel_id: str,
    check_in: date,
    check_out: date,
    rooms: int = 1,
) -> Result:
    """Add a stay to a draft. The hotel must be at the trip's destination and
    the nights within the trip's dates. Rooms are checked now but only
    reserved when the user confirms."""
    trip = await ctx.deps.client.post(
        f"/itineraries/{trip_id}/hotels",
        {
            "hotelId": hotel_id,
            "checkInDate": check_in.isoformat(),
            "checkOutDate": check_out.isoformat(),
            "rooms": rooms,
        },
    )
    return presenters.trip(trip)


@reports_errors
async def remove_hotel_stay(ctx: RunContext[TrekDeps], trip_id: str, item_id: str) -> Result:
    """Remove a hotel stay from a draft (item_id from the trip's hotelStays)."""
    trip = await ctx.deps.client.delete(f"/itineraries/{trip_id}/hotels/{item_id}")
    return presenters.trip(trip)


@reports_errors
async def add_flight(
    ctx: RunContext[TrekDeps],
    trip_id: str,
    flight_id: str,
    passengers: int | None = None,
    traveler_ids: list[str] | None = None,
) -> Result:
    """Add a flight to a draft. It must depart within the trip's dates.

    Args:
        trip_id: the draft.
        flight_id: from search_flights.
        passengers: number of seats; may be omitted when traveler_ids is given.
        traveler_ids: saved travelers flying (from get_user_context); their
            count must equal passengers.
    """
    body: dict[str, Any] = {"flightId": flight_id}
    if passengers is not None:
        body["passengers"] = passengers
    if traveler_ids:
        body["travelerIds"] = traveler_ids
    trip = await ctx.deps.client.post(f"/itineraries/{trip_id}/flights", body)
    return presenters.trip(trip)


@reports_errors
async def remove_flight(ctx: RunContext[TrekDeps], trip_id: str, item_id: str) -> Result:
    """Remove a flight from a draft (item_id from the trip's flights)."""
    trip = await ctx.deps.client.delete(f"/itineraries/{trip_id}/flights/{item_id}")
    return presenters.trip(trip)


@reports_errors
async def quote_trip(ctx: RunContext[TrekDeps], trip_id: str) -> Result:
    """What confirming the draft would cost right now, and anything blocking it.

    Always quote before telling the user a total: prices can change after
    items are added. `bookable` is false when an issue would make
    confirmation fail.
    """
    return presenters.quote(await ctx.deps.client.get(f"/itineraries/{trip_id}/quote"))
