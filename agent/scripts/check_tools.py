"""Runs every tool against a real Trek API, without any LLM, to check the
tools still match the API's responses. Needs the sample catalogue loaded.

    uv run python scripts/check_tools.py <agent token> [trek api url]

Get a token by logging in, then POST /api/auth/agent-token with the access
token. It creates a draft trip and deletes it again.
"""

import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import httpx

from trek_agent import tools
from trek_agent.tools import TrekDeps
from trek_agent.trek_client import TrekClient


def show(name: str, result: dict[str, Any]) -> dict[str, Any]:
    text = json.dumps(result, ensure_ascii=False)
    print(f"{'ERROR ' if 'error' in result else 'ok    '}{name}: {text[:160]}")
    return result


async def main(token: str, api_url: str) -> int:
    async with httpx.AsyncClient(base_url=api_url, timeout=30) as http:
        today = datetime.now(UTC).date()
        ctx: Any = SimpleNamespace(deps=TrekDeps(client=TrekClient(http, token), today=today))
        start, end = today + timedelta(days=5), today + timedelta(days=8)

        show("get_user_context", await tools.get_user_context(ctx))
        found = show("search_destinations", await tools.search_destinations(ctx, "Nairobi"))
        nairobi = found["destinations"][0]
        hotels = show(
            "search_hotels",
            await tools.search_hotels(ctx, nairobi["id"], start, end, rooms=1),
        )
        flights = show("search_flights", await tools.search_flights(ctx, "kgl", "nbo", start))
        trip = show(
            "create_draft_trip",
            await tools.create_draft_trip(ctx, "Tool check", nairobi["id"], start, end),
        )
        trip_id = trip["id"]
        show(
            "add_hotel_stay",
            await tools.add_hotel_stay(ctx, trip_id, hotels["hotels"][0]["id"], start, end),
        )
        with_flight = show(
            "add_flight",
            await tools.add_flight(ctx, trip_id, flights["flights"][0]["id"], passengers=1),
        )
        show("update_draft_trip", await tools.update_draft_trip(ctx, trip_id, name="Renamed"))
        show("get_trip", await tools.get_trip(ctx, trip_id))
        show("list_trips", await tools.list_trips(ctx, status="DRAFT"))
        quote = show("quote_trip", await tools.quote_trip(ctx, trip_id))
        show(
            "remove_flight",
            await tools.remove_flight(ctx, trip_id, with_flight["flights"][0]["itemId"]),
        )
        show(
            "remove_hotel_stay",
            await tools.remove_hotel_stay(ctx, trip_id, quote["hotelStays"][0]["itemId"]),
        )
        show("delete_draft_trip", await tools.delete_draft_trip(ctx, trip_id))
        # An expected failure, to see an error as the model would.
        show("search_hotels (bad id)", await tools.search_hotels(ctx, "nope", start, end))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:3000/api"
    sys.exit(asyncio.run(main(sys.argv[1], url)))
