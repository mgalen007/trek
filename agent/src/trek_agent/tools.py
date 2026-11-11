"""The agent's tools: one per Trek operation open to agent tokens.

Each tool returns a compact summary (not the raw API response) to keep the
model's context small. Business errors come back as
`{"error": {"code", "message", "details"}}` so the model can adapt (offer
another hotel, re-quote...); an expired agent token stops the whole run.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from functools import wraps
from typing import Any, Literal

from pydantic_ai import RunContext

from .trek_client import AgentTokenRejected, TrekApiError, TrekClient


@dataclass
class TrekDeps:
    client: TrekClient
    today: date


Result = dict[str, Any]


def _reports_errors[**P](
    tool: Callable[P, Awaitable[Result]],
) -> Callable[P, Awaitable[Result]]:
    @wraps(tool)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> Result:
        try:
            return await tool(*args, **kwargs)
        except AgentTokenRejected:
            raise
        except TrekApiError as err:
            return {
                "error": {
                    "code": err.code,
                    "message": err.message,
                    "details": err.details,
                }
            }

    return wrapper


# --- Profile ---------------------------------------------------------------


@_reports_errors
async def get_user_context(ctx: RunContext[TrekDeps]) -> Result:
    """The user's name, travel preferences and saved travelers.

    Call this first in a conversation: preferences are the defaults to plan
    with (currency, nightly budget, minimum hotel rating, home airport,
    usual number of travelers).
    """
    client = ctx.deps.client
    me = await client.get("/auth/me")
    preferences = await client.get("/users/me/preferences")
    travelers = await client.get("/travelers", limit=50)
    home = (preferences or {}).get("homeAirport") or {}
    return {
        "name": f"{me['firstName']} {me['lastName']}",
        "preferences": {
            "currency": preferences.get("currency"),
            "maxNightlyRate": preferences.get("maxNightlyRate"),
            "minHotelRating": preferences.get("minHotelRating"),
            "homeAirport": home.get("code"),
            "defaultTravelers": preferences.get("defaultTravelers"),
            "notes": preferences.get("notes"),
        }
        if preferences
        else None,
        "travelers": [
            {
                "id": t["id"],
                "name": f"{t['firstName']} {t['lastName']}",
                "dateOfBirth": t.get("dateOfBirth"),
            }
            for t in travelers
        ],
    }


# --- Catalogue -------------------------------------------------------------


@_reports_errors
async def search_destinations(ctx: RunContext[TrekDeps], query: str) -> Result:
    """Find destinations by name, city or country, with their airport codes.

    Args:
        query: e.g. "Paris", "Kenya".
    """
    client = ctx.deps.client
    destinations = await client.get("/destinations", q=query, limit=5)
    results = []
    for d in destinations:
        airports = await client.get(f"/destinations/{d['id']}/airports")
        results.append(
            {
                "id": d["id"],
                "name": d["name"],
                "country": d["country"],
                "description": d.get("description"),
                "airports": [a["code"] for a in airports],
            }
        )
    return {"destinations": results}


@_reports_errors
async def search_hotels(
    ctx: RunContext[TrekDeps],
    destination_id: str,
    check_in: date,
    check_out: date,
    rooms: int = 1,
    min_rating: float | None = None,
    max_nightly_rate: float | None = None,
    currency: str | None = None,
    sort: Literal["price", "rating", "name"] = "price",
) -> Result:
    """Hotels at a destination with enough free rooms for the dates.

    Args:
        destination_id: from search_destinations.
        check_in: first night.
        check_out: departure day (after the last night).
        rooms: rooms needed.
        min_rating: lowest star rating, e.g. 4.
        max_nightly_rate: highest price per room per night, in `currency`.
        currency: 3-letter code to filter prices by, e.g. "USD".
        sort: order of results; cheapest first by default.
    """
    hotels = await ctx.deps.client.get(
        "/hotels",
        destinationId=destination_id,
        checkIn=check_in,
        checkOut=check_out,
        rooms=rooms,
        minRating=min_rating,
        maxPrice=max_nightly_rate,
        currency=currency,
        sort=sort,
        order="desc" if sort == "rating" else "asc",
        limit=10,
    )
    return {
        "hotels": [
            {
                "id": h["id"],
                "name": h["name"],
                "address": h["address"],
                "rating": h.get("rating"),
                "nightlyRate": h["nightlyRate"],
                "currency": h["currency"],
                "availableRooms": h.get("availableRooms"),
            }
            for h in hotels
        ]
    }


@_reports_errors
async def search_flights(
    ctx: RunContext[TrekDeps],
    from_airport: str,
    to_airport: str,
    date: date,
    passengers: int = 1,
    max_price: float | None = None,
) -> Result:
    """Direct flights between two airports on a day, cheapest first.

    There are no connecting itineraries: for a route with no direct flight,
    search each leg separately (e.g. via a hub like NBO, DXB, LHR or JFK).
    Times are UTC.

    Args:
        from_airport: departure airport code, e.g. "KGL".
        to_airport: arrival airport code, e.g. "NBO".
        date: departure day.
        passengers: seats needed.
        max_price: highest price per passenger.
    """
    flights = await ctx.deps.client.get(
        "/flights",
        **{"from": from_airport.upper(), "to": to_airport.upper()},
        date=date,
        passengers=passengers,
        maxPrice=max_price,
        sort="price",
        order="asc",
        limit=10,
    )
    return {
        "flights": [
            {
                "id": f["id"],
                "flightNumber": f["flightNumber"],
                "airline": f["airline"],
                "from": f["departureAirport"]["code"],
                "to": f["arrivalAirport"]["code"],
                "departureAt": f["departureAt"],
                "arrivalAt": f["arrivalAt"],
                "price": f["price"],
                "currency": f["currency"],
                "availableSeats": f["availableSeats"],
            }
            for f in flights
        ]
    }


# --- Trips -----------------------------------------------------------------


@_reports_errors
async def list_trips(
    ctx: RunContext[TrekDeps],
    status: Literal["DRAFT", "PLANNED", "CANCELLED", "COMPLETED"] | None = None,
) -> Result:
    """The user's trips, soonest first, optionally only those in one status."""
    trips = await ctx.deps.client.get("/itineraries", status=status, limit=20)
    return {
        "trips": [
            {
                "id": t["id"],
                "name": t["name"],
                "status": t["status"],
                "destination": t["destination"]["name"],
                "startDate": t["startDate"][:10],
                "endDate": t["endDate"][:10],
            }
            for t in trips
        ]
    }


@_reports_errors
async def get_trip(ctx: RunContext[TrekDeps], trip_id: str) -> Result:
    """A trip with its hotel stays, flights and totals (prices as added)."""
    return _trip(await ctx.deps.client.get(f"/itineraries/{trip_id}"))


@_reports_errors
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
    return _trip(trip)


@_reports_errors
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
    return _trip(trip)


@_reports_errors
async def delete_draft_trip(ctx: RunContext[TrekDeps], trip_id: str) -> Result:
    """Delete a draft trip. Only do this when the user asks to."""
    await ctx.deps.client.delete(f"/itineraries/{trip_id}")
    return {"deleted": trip_id}


@_reports_errors
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
    return _trip(trip)


@_reports_errors
async def remove_hotel_stay(ctx: RunContext[TrekDeps], trip_id: str, item_id: str) -> Result:
    """Remove a hotel stay from a draft (item_id from the trip's hotelStays)."""
    trip = await ctx.deps.client.delete(f"/itineraries/{trip_id}/hotels/{item_id}")
    return _trip(trip)


@_reports_errors
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
    return _trip(trip)


@_reports_errors
async def remove_flight(ctx: RunContext[TrekDeps], trip_id: str, item_id: str) -> Result:
    """Remove a flight from a draft (item_id from the trip's flights)."""
    trip = await ctx.deps.client.delete(f"/itineraries/{trip_id}/flights/{item_id}")
    return _trip(trip)


@_reports_errors
async def quote_trip(ctx: RunContext[TrekDeps], trip_id: str) -> Result:
    """What confirming the draft would cost right now, and anything blocking it.

    Always quote before telling the user a total: prices can change after
    items are added. `bookable` is false when an issue would make
    confirmation fail.
    """
    quote = await ctx.deps.client.get(f"/itineraries/{trip_id}/quote")
    return {
        "tripId": quote["itineraryId"],
        "status": quote["status"],
        "bookable": quote["bookable"],
        "totals": quote["totals"],
        "hotelStays": [
            {
                "itemId": s["itemId"],
                "hotel": s["hotelName"],
                "checkIn": s["checkInDate"],
                "checkOut": s["checkOutDate"],
                "rooms": s["rooms"],
                "totalPrice": s["totalPrice"],
                "currency": s["currency"],
                "priceChanged": s["priceChanged"],
            }
            for s in quote["hotelStays"]
        ],
        "flights": [
            {
                "itemId": f["itemId"],
                "flight": f"{f['airline']} {f['flightNumber']}",
                "departureAt": f["departureAt"],
                "passengers": f["passengers"],
                "totalPrice": f["totalPrice"],
                "currency": f["currency"],
                "priceChanged": f["priceChanged"],
            }
            for f in quote["flights"]
        ],
        "issues": quote["issues"],
    }


def _trip(trip: dict[str, Any]) -> Result:
    return {
        "id": trip["id"],
        "name": trip["name"],
        "status": trip["status"],
        "destination": (trip.get("destination") or {}).get("name"),
        "startDate": trip["startDate"][:10],
        "endDate": trip["endDate"][:10],
        "hotelStays": [
            {
                "itemId": s["id"],
                "hotel": s["hotel"]["name"],
                "checkIn": s["checkInDate"][:10],
                "checkOut": s["checkOutDate"][:10],
                "rooms": s["rooms"],
                "totalPrice": s["totalPrice"],
                "currency": s["currency"],
            }
            for s in trip.get("itineraryHotel", [])
        ],
        "flights": [_trip_flight(f) for f in trip.get("itineraryFlight", [])],
        "totals": trip.get("totals"),
    }


def _trip_flight(item: dict[str, Any]) -> Result:
    flight = item["flight"]
    return {
        "itemId": item["id"],
        "flight": f"{flight['airline']} {flight['flightNumber']}",
        "route": f"{flight['departureAirport']['code']}-{flight['arrivalAirport']['code']}",
        "departureAt": flight["departureAt"],
        "passengers": item["passengers"],
        "totalPrice": item["totalPrice"],
        "currency": item["currency"],
    }


TOOLS = [
    get_user_context,
    search_destinations,
    search_hotels,
    search_flights,
    list_trips,
    get_trip,
    create_draft_trip,
    update_draft_trip,
    delete_draft_trip,
    add_hotel_stay,
    remove_hotel_stay,
    add_flight,
    remove_flight,
    quote_trip,
]
