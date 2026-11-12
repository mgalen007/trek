from fastapi.testclient import TestClient

from trek_agent.app import create_app
from trek_agent.core.config import Settings

from ..fakes import FakeTrek, ScriptedModel

WEB_APP = "http://localhost:5173"


def preflight(client: TestClient, origin: str):
    return client.options(
        "/chat",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


def app_with(settings: Settings, trek: FakeTrek, origins: str) -> TestClient:
    configured = settings.model_copy(update={"cors_origins": origins})
    return TestClient(
        create_app(configured, model=ScriptedModel([]).model(), trek_transport=trek.transport())
    )


def test_lets_the_web_app_call_chat(settings: Settings, trek: FakeTrek) -> None:
    with app_with(settings, trek, f"{WEB_APP}, https://app.example.com") as client:
        res = preflight(client, WEB_APP)

    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == WEB_APP
    assert "authorization" in res.headers["access-control-allow-headers"].lower()


def test_refuses_other_origins(settings: Settings, trek: FakeTrek) -> None:
    with app_with(settings, trek, WEB_APP) as client:
        res = preflight(client, "https://evil.example")

    assert "access-control-allow-origin" not in res.headers


def test_is_off_by_default(settings: Settings, trek: FakeTrek) -> None:
    with app_with(settings, trek, "") as client:
        res = preflight(client, WEB_APP)

    assert "access-control-allow-origin" not in res.headers
