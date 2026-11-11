"""Test doubles: a fake Trek API (httpx MockTransport) and a scripted model
(PydanticAI FunctionModel), so tests need no network and no API key."""

import json
from dataclasses import dataclass, field
from typing import Any

import httpx
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

TREK_URL = "http://trek.test/api"
TOKEN = "agent-token-for-ada"


@dataclass
class FakeTrek:
    """Answers Trek API calls from `routes` ("GET /flights" -> status, body)
    and records every request. A body may be a function of the request."""

    routes: dict[str, tuple[int, Any]] = field(default_factory=dict)
    requests: list[httpx.Request] = field(default_factory=list)

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path.removeprefix("/api")
        status, body = self.routes.get(
            f"{request.method} {path}",
            (404, {"statusCode": 404, "error": {"code": "NOT_FOUND", "message": path}}),
        )
        if callable(body):
            body = body(request)
        return httpx.Response(status, json=body)

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)

    def http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=TREK_URL, transport=self.transport())

    def calls(self, method: str, path: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == method and r.url.path == f"/api{path}"]


def ok(data: Any) -> tuple[int, Any]:
    return 200, {"data": data}


def error(status: int, code: str, message: str = "nope") -> tuple[int, Any]:
    return status, {"statusCode": status, "error": {"code": code, "message": message}}


def me(user_id: str = "user-ada") -> dict[str, Any]:
    return {
        "id": user_id,
        "email": "ada@trek.test",
        "firstName": "Ada",
        "lastName": "Lovelace",
    }


Step = list[ToolCallPart] | str


@dataclass
class ScriptedModel:
    """Plays the LLM: each step either calls tools or replies with text.
    `seen` keeps the messages the model received on each call."""

    steps: list[Step]
    seen: list[list[ModelMessage]] = field(default_factory=list)

    def model(self) -> FunctionModel:
        def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
            self.seen.append(list(messages))
            step = self.steps[len(self.seen) - 1]
            if isinstance(step, str):
                return ModelResponse(parts=[TextPart(step)])
            return ModelResponse(parts=step)

        return FunctionModel(respond)

    def tool_results(self) -> dict[str, Any]:
        """Tool name -> what the tool returned to the model (last call)."""
        results: dict[str, Any] = {}
        for messages in self.seen:
            for message in messages:
                if isinstance(message, ModelRequest):
                    for part in message.parts:
                        if isinstance(part, ToolReturnPart):
                            results[part.tool_name] = part.content
        return results


def call(tool: str, **args: Any) -> ToolCallPart:
    return ToolCallPart(tool_name=tool, args=json.dumps(args))
