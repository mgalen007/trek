from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

from ...clients.trek import AgentTokenRejected, TrekApiError

Result = dict[str, Any]


def reports_errors[**P](
    tool: Callable[P, Awaitable[Result]],
) -> Callable[P, Awaitable[Result]]:
    """Trek errors become `{"error": {"code", "message", "details"}}` for the
    model to act on (offer another hotel, re-quote...). A rejected agent token
    isn't the model's problem: it stops the run so the caller can answer 401."""

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
