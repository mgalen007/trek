"""Trek's travel assistant: a PydanticAI agent behind a FastAPI service."""


def main() -> None:
    """`uv run trek-agent`: serve the API on AGENT_HOST:AGENT_PORT (default 127.0.0.1:8000)."""
    import os

    import uvicorn

    uvicorn.run(
        "trek_agent.main:app",
        host=os.environ.get("AGENT_HOST", "127.0.0.1"),
        port=int(os.environ.get("AGENT_PORT", "8000")),
    )
