from pydantic_ai import RunContext

from ..deps import TrekDeps
from . import presenters
from .errors import Result, reports_errors


@reports_errors
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
    return presenters.user_context(me, preferences, travelers)
