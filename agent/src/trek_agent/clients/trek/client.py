"""Thin async client for the Trek API, acting with the user's agent token."""

import asyncio
from typing import Any
from uuid import uuid4

import httpx

from .errors import AgentTokenRejected, TrekApiError

# Retries for network failures and 429s. POSTs keep the same Idempotency-Key
# across retries, so a retried request never books or creates anything twice.
MAX_ATTEMPTS = 3
MAX_RETRY_WAIT_SECONDS = 10.0


class TrekClient:
    def __init__(self, http: httpx.AsyncClient, token: str) -> None:
        self._http = http
        self._token = token

    async def get(self, path: str, **params: Any) -> Any:
        return await self.request("GET", path, params=params)

    async def post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        return await self.request("POST", path, json=body or {})

    async def put(self, path: str, body: dict[str, Any]) -> Any:
        return await self.request("PUT", path, json=body)

    async def delete(self, path: str) -> Any:
        return await self.request("DELETE", path)

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        """Returns the response's `data`, or raises TrekApiError."""
        headers = {"Authorization": f"Bearer {self._token}"}
        if method == "POST":
            headers["Idempotency-Key"] = str(uuid4())
        query = {k: _param(v) for k, v in (params or {}).items() if v is not None}

        response: httpx.Response | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = await self._http.request(
                    method, path, params=query, json=json, headers=headers
                )
            except httpx.TransportError as err:
                if attempt == MAX_ATTEMPTS:
                    raise TrekApiError(
                        0, "TREK_UNREACHABLE", f"Trek API unreachable: {err}"
                    ) from err
                continue
            if response.status_code == 429 and attempt < MAX_ATTEMPTS:
                await asyncio.sleep(_retry_after(response))
                continue
            break

        assert response is not None
        body = response.json() if response.content else None
        if response.is_success:
            return body.get("data") if isinstance(body, dict) else body

        error = (body or {}).get("error", {}) if isinstance(body, dict) else {}
        error_type = AgentTokenRejected if response.status_code == 401 else TrekApiError
        raise error_type(
            response.status_code,
            error.get("code", "UNKNOWN"),
            error.get("message", response.reason_phrase),
            error.get("details"),
        )


def _param(value: Any) -> Any:
    # Dates go out as YYYY-MM-DD, everything else as-is.
    return value.isoformat() if hasattr(value, "isoformat") else value


def _retry_after(response: httpx.Response) -> float:
    try:
        seconds = float(response.headers.get("Retry-After", "1"))
    except ValueError:
        seconds = 1.0
    return min(max(seconds, 0.0), MAX_RETRY_WAIT_SECONDS)
