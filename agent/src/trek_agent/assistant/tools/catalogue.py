from datetime import date
from typing import Literal

from pydantic_ai import RunContext

from ..deps import TrekDeps
from . import presenters
from .errors import Result, reports_errors


@reports_errors
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
        results.append(presenters.destination(d, airports))
    return {"destinations": results}


@reports_errors
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
    return {"hotels": [presenters.hotel(h) for h in hotels]}


@reports_errors
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
    return {"flights": [presenters.flight(f) for f in flights]}
