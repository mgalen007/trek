"""The assistant's tools: one per Trek operation open to agent tokens
(`x-agent-allowed` in Trek's OpenAPI spec), grouped by domain."""

from .catalogue import search_destinations, search_flights, search_hotels
from .profile import get_user_context
from .trips import (
    add_flight,
    add_hotel_stay,
    create_draft_trip,
    delete_draft_trip,
    get_trip,
    list_trips,
    quote_trip,
    remove_flight,
    remove_hotel_stay,
    update_draft_trip,
)

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

__all__ = ["TOOLS", *(tool.__name__ for tool in TOOLS)]
