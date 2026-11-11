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
| `AGENT_HOST`, `AGENT_PORT` | | `127.0.0.1`, `8000` | Where the service listens |

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

Send the `conversation_id` back with the next message to continue the conversation. Agent tokens last 15 minutes: when `/chat` answers 401, get a new one (the conversation is kept).

| Status | Meaning |
|---|---|
| 401 | Missing, expired or invalid agent token |
| 404 | Unknown conversation, or another user's |
| 422 | Invalid message, or the assistant needed too many steps |
| 502 | The Trek API answered with an unexpected error |

## How it works

- `tools.py`: one hand-written tool per Trek operation open to agents (`x-agent-allowed` in Trek's OpenAPI spec). Each returns a compact summary. API errors reach the model as `{"error": {"code", ...}}`, so it can react, for example offering another hotel when one is full.
- `agent.py`: the instructions (plan with the user's preferences, never invent results, quote before stating a price, never book) and the OpenRouter model.
- `trek_client.py`: sends the agent token, retries network failures and `429`s (honouring `Retry-After`), and gives each POST an `Idempotency-Key`, so retries never create anything twice.
- `conversations.py`: chat history, in memory, per user.
- One chat message may use at most 30 model calls (`USAGE_LIMITS` in `app.py`), so a confused model can't loop, or spend, forever.

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
- **A Docker image** for this service.
