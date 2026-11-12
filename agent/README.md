# Trek agent

Trek's travel assistant: a [PydanticAI](https://ai.pydantic.dev/) agent behind a small FastAPI service. It plans trips for a signed-in user by calling the Trek API, using a model on [OpenRouter](https://openrouter.ai/).

It can search the catalogue, read the user's preferences and travelers, build and edit **draft** trips, and quote them. It can't book: the user confirms in the app. The Trek API enforces that, whatever the model does, because the agent only ever holds an agent token.

```
Web app (user signed in)
  │ 1. POST /api/auth/agent-token on Trek  → short-lived agent token
  │ 2. POST /chat on this service, with that token
  ▼
This service ── tools ──▶ Trek API (drafting and reading only)
```

## Setup

Requirements: [uv](https://docs.astral.sh/uv/), a running Trek API (with the [sample data](../README.md#sample-data) for something to plan with), and an OpenRouter API key.

```bash
cd agent
uv sync
cp .env.example .env      # then fill in OPENROUTER_API_KEY and AGENT_MODEL
uv run trek-agent         # serves on http://127.0.0.1:8000
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | | OpenRouter API key |
| `AGENT_MODEL` | yes | | OpenRouter model id; it must support tool calling (e.g. `openai/gpt-4.1-mini`) |
| `TREK_API_URL` | | `http://localhost:3000/api` | The Trek API, with its `/api` prefix |
| `OPENROUTER_BASE_URL` | | `https://openrouter.ai/api/v1` | Any OpenAI-compatible endpoint works |
| `CONVERSATION_TTL_MINUTES` | | `120` | How long an idle conversation is kept |
| `CORS_ORIGINS` | | | Browser origins allowed to call the agent, comma-separated (e.g. `http://localhost:5173`); CORS is off when unset |
| `AGENT_HOST`, `AGENT_PORT` | | `127.0.0.1`, `8000` | Where the service listens |

### With Docker

The project's `docker compose up --build` (from the repository root) runs the agent alongside the API, on http://localhost:8000 (`AGENT_PORT` to change it). It reads `OPENROUTER_API_KEY` and `AGENT_MODEL` from `agent/.env`, and reaches the API over the internal network, whatever `TREK_API_URL` says there. Without a key or model, the agent exits at startup with a clear error, and the rest of the stack runs on. To build the image alone: `docker build -t trek-agent agent`.

## Talking to it

Until there's a web app, get an agent token by hand and call `/chat`:

```bash
TREK=http://localhost:3000/api
ACCESS=$(curl -s -X POST $TREK/auth/login -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .data.accessToken)
AGENT=$(curl -s -X POST $TREK/auth/agent-token -H "Authorization: Bearer $ACCESS" | jq -r .data.accessToken)

curl -s -X POST http://127.0.0.1:8000/chat -H "Authorization: Bearer $AGENT" \
  -H "Content-Type: application/json" \
  -d '{"message":"Plan 3 nights in Nairobi next month, flying from Kigali"}'
# → {"conversation_id": "...", "reply": "..."}
```

Or use the interactive docs at http://localhost:8000/docs: click **Authorize**, paste the agent token alone (Swagger UI adds `Bearer ` itself), then try `POST /chat`.

Send the `conversation_id` back with the next message to continue the conversation. Agent tokens last 15 minutes: when `/chat` answers 401, get a new one (the conversation is kept).

Errors come back as `{"error": {"code", "message"}}`, the same shape as the Trek API's:

| Status | `error.code` | Meaning |
|---|---|---|
| 401 | `MISSING_AGENT_TOKEN`, `INVALID_AGENT_TOKEN` | No agent token, or it's expired or invalid |
| 404 | `CONVERSATION_NOT_FOUND` | Unknown conversation, or another user's |
| 422 | `STEP_LIMIT_REACHED` | The assistant needed too many steps (invalid bodies are also 422, in FastAPI's format) |
| 502 | `TREK_ERROR` | The Trek API answered with an unexpected error |

## How it's organised

Layers call downwards only: **routers → services → repositories, clients and the assistant**. `core/` is shared by all of them and has no web-framework code.

```
src/trek_agent/
  app.py              composition: builds the app, includes routers, registers error handlers
  main.py             ASGI entry point
  api/                HTTP layer only (the only FastAPI code, with app.py)
    routers/          chat.py, health.py: request → service call → response
    schemas/          request and response models
    dependencies.py   agent token from the header, Trek client and services per request
    error_handlers.py domain errors → {"error": {"code", "message"}}
  services/
    chat_service.py   the chat flow: who is asking → which conversation → run the assistant → save
  repositories/
    conversations.py  ConversationRepository (interface) + the in-memory version
  clients/trek/       the Trek API: token, retries, 429s, Idempotency-Key; TrekApiError
  assistant/          the PydanticAI agent
    agent.py          the agent, its tools, today's date, usage limits
    instructions.py   what the model is told
    model.py          the OpenRouter model
    deps.py           what every tool receives
    tools/            catalogue.py, trips.py, profile.py, plus presenters.py (what the model sees)
  core/               config.py, errors.py (domain errors), resources.py (shared HTTP client, model, repository)
```

- **Adding an endpoint:** a router in `api/routers/` that calls a service. Business rules go in the service, which raises domain errors from `core/errors.py`; never build error responses in routers.
- **Adding a tool:** a function in the right `assistant/tools/` module, decorated with `@reports_errors`, returning a presenter's output, and listed in `TOOLS`. Its docstring is what the model reads. Only add tools for Trek operations open to agents (`x-agent-allowed`).
- **Durable conversations:** implement `ConversationRepository` (e.g. with Redis) and create it in `core/resources.py`; nothing else changes.
- Tool errors reach the model as `{"error": {"code", ...}}`, so it can react, for example offering another hotel when one is full. One chat message may use at most 30 model calls (`USAGE_LIMITS` in `assistant/agent.py`).

## Development

```bash
uv run pytest                 # tests: a scripted model and a fake Trek API, no network or key needed
uv run ruff check .           # lint
uv run ruff format .          # format
uv run python scripts/check_tools.py <agent token>   # every tool against a real Trek API, no LLM
```

## Not yet

- **Streaming replies:** `/chat` answers once the reply is complete.
- **Shared conversation storage:** history lives in this process, so it's lost on restart and not shared between instances.
