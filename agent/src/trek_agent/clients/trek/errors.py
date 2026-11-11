from typing import Any


class TrekApiError(Exception):
    """An error answer from the Trek API; `code` is its machine-readable code."""

    def __init__(self, status: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class AgentTokenRejected(TrekApiError):
    """The agent token is missing, expired or invalid: the web app must get a new one."""
