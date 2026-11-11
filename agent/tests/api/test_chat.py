"""The HTTP layer: auth header, validation, status codes and error shape.
The chat flow itself is tested in services/test_chat_service.py."""

from fastapi.testclient import TestClient

from trek_agent.app import create_app
from trek_agent.core.config import Settings

from ..fakes import TOKEN, FakeTrek, ScriptedModel, error, me

AUTH = {"Authorization": f"Bearer {TOKEN}"}


def client_for(settings: Settings, trek: FakeTrek, script: ScriptedModel) -> TestClient:
    return TestClient(create_app(settings, model=script.model(), trek_transport=trek.transport()))


def test_replies_and_returns_a_conversation_id(settings: Settings, trek: FakeTrek) -> None:
    with client_for(settings, trek, ScriptedModel(["Where to?", "Paris it is."])) as client:
        first = client.post("/chat", headers=AUTH, json={"message": "Plan a trip"})
        second = client.post(
            "/chat",
            headers=AUTH,
            json={"message": "Paris", "conversation_id": first.json()["conversation_id"]},
        )

    assert first.status_code == 200
    assert first.json()["reply"] == "Where to?"
    assert second.json() == {
        "conversation_id": first.json()["conversation_id"],
        "reply": "Paris it is.",
    }


def test_requires_an_agent_token(settings: Settings, trek: FakeTrek) -> None:
    with client_for(settings, trek, ScriptedModel([])) as client:
        res = client.post("/chat", json={"message": "hi"})

    assert res.status_code == 401
    assert res.json()["error"]["code"] == "MISSING_AGENT_TOKEN"


def test_rejected_tokens_get_401_so_the_web_app_fetches_a_new_one(
    settings: Settings, trek: FakeTrek
) -> None:
    trek.routes["GET /auth/me"] = error(401, "UNAUTHORIZED")

    with client_for(settings, trek, ScriptedModel([])) as client:
        res = client.post("/chat", headers=AUTH, json={"message": "hi"})

    assert res.status_code == 401
    assert res.json() == {
        "error": {"code": "INVALID_AGENT_TOKEN", "message": "Agent token rejected; get a new one"}
    }


def test_another_users_conversation_is_404(settings: Settings, trek: FakeTrek) -> None:
    users = iter([me("user-ada"), me("user-bob")])
    trek.routes["GET /auth/me"] = (200, lambda _: {"data": next(users)})

    with client_for(settings, trek, ScriptedModel(["Hello Ada"])) as client:
        ada = client.post("/chat", headers=AUTH, json={"message": "hi"}).json()
        bob = client.post(
            "/chat",
            headers=AUTH,
            json={"message": "hi", "conversation_id": ada["conversation_id"]},
        )

    assert bob.status_code == 404
    assert bob.json()["error"]["code"] == "CONVERSATION_NOT_FOUND"


def test_trek_failures_are_502(settings: Settings, trek: FakeTrek) -> None:
    trek.routes["GET /auth/me"] = error(500, "INTERNAL_ERROR")

    with client_for(settings, trek, ScriptedModel([])) as client:
        res = client.post("/chat", headers=AUTH, json={"message": "hi"})

    assert res.status_code == 502
    assert res.json()["error"]["code"] == "TREK_ERROR"


def test_validates_the_message(settings: Settings, trek: FakeTrek) -> None:
    with client_for(settings, trek, ScriptedModel([])) as client:
        assert client.post("/chat", headers=AUTH, json={"message": ""}).status_code == 422


def test_health(settings: Settings, trek: FakeTrek) -> None:
    with client_for(settings, trek, ScriptedModel([])) as client:
        assert client.get("/health").json() == {"status": "ok"}
