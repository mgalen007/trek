from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import UsageLimits

from .deps import TrekDeps
from .instructions import INSTRUCTIONS
from .tools import TOOLS

# Caps model calls per chat message, so a confused model can't loop (and
# spend) forever. Planning a whole trip takes well under this.
USAGE_LIMITS = UsageLimits(request_limit=30, tool_calls_limit=60)

# The model is chosen per run (see services/chat_service.py), so tests can
# swap in a scripted one.
trek_agent = Agent(
    deps_type=TrekDeps,
    instructions=INSTRUCTIONS,
    tools=TOOLS,
)


@trek_agent.instructions
def todays_date(ctx: RunContext[TrekDeps]) -> str:
    return f"Today is {ctx.deps.today.isoformat()} (UTC)."
