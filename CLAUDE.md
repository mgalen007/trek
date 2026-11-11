# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Trek is a travel booking and itinerary-planning REST API: NestJS 11, Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) on PostgreSQL. Users browse destinations, hotels, airports and flights, build a draft itinerary, and confirm it to reserve every room and seat at once.

The API is being shaped to be driven by an **AI agent built with PydanticAI** (a separate Python service in `agent/`, see [Agent](#agent-agent)). Design decisions favour what an agent needs: a predictable response shape, machine-readable error codes, a complete OpenAPI spec with stable operation ids, and retry-safe mutations.

## Tooling

Use **bun / bunx** for everything on the API side — never npm, npx or node directly. The Python agent in `agent/` uses **uv**.

```bash
bun install
bunx prisma generate             # writes the client to generated/prisma (gitignored) — needed after install and schema changes
bunx prisma migrate dev --name <name>   # create + apply a migration in development
bun run start:dev                # watch mode; API under /api, Swagger UI at /api/docs, spec at /api/docs-json

bun run lint:check               # eslint, zero warnings allowed (`bun run lint` auto-fixes)
bun run typecheck
bun run build
bun run test                     # unit tests (*.spec.ts in src/ and common/)
bun run test:e2e                 # e2e tests (test/*.e2e-spec.ts) against a real Postgres
bun run openapi:export           # build, then write openapi.json (gitignored; needs JWT_SECRET, no DB)
bun run seed:catalogue           # build, then add the sample catalogue to DATABASE_URL (idempotent)

# Single test file / single test
bun run test -- src/inventory/inventory.service.spec.ts
bun run test -- -t "retries P2034"
bun run test:e2e -- test/idempotency.e2e-spec.ts
```

CI (`.github/workflows/ci.yml`) runs lint:check → typecheck → build → OpenAPI export, then unit + e2e tests against a Postgres 17 service, and a `docker` job that brings the compose stack up and checks readiness. Run the same lint → test sequence locally before committing.

### Docker

**Sample data** (`src/scripts/sample-catalogue.ts` holds the data, `catalogue-seed.ts` the logic, `seed-catalogue.ts` the entry point): 17 destinations across Africa, the Middle East, Europe and the Americas, 3 hotels each, their airports and flights on 33 routes both ways for `SAMPLE_DATA_DAYS` (default 90). Hotel and airline names are invented; airport codes are real; times are UTC; prices vary deterministically by day. It only creates what's missing (destinations by name+country, airports by code, hotels by name per destination, flights by number+departure) and never updates or deletes, so it's safe to re-run. Refuses `NODE_ENV=production` unless `ALLOW_SAMPLE_DATA=true`. `seedCatalogue(db, { days })` is a plain function, used by `test/sample-data.e2e-spec.ts`.

`docker compose up --build` runs Postgres 17, Mailpit (catches every email; inbox at http://localhost:8025 — set `SMTP_URL` to send for real), a one-off `migrate` job (`prisma migrate deploy`, from the Dockerfile's `build` stage since the Prisma CLI is a dev dependency), a one-off `seed` job (the sample catalogue, from the runtime image) and the API on `${API_PORT:-3000}`, then the agent (`agent/Dockerfile`: uv build stage, `python:3.13-slim` runtime as a non-root user, health-checks `/health`) on `${AGENT_PORT:-8000}`. The agent reads `OPENROUTER_API_KEY` / `AGENT_MODEL` from `agent/.env` (optional `env_file`; it exits at startup if they're empty, `restart: on-failure:3`) and always reaches the API at `http://api:3000/api`. CI writes a dummy `agent/.env`: the agent's health check never calls the model. Compose takes secrets (`JWT_SECRET`, `SEED_ADMIN_*`) from `.env` or the shell but always points the API at the `db` service; Postgres isn't published to the host. The Dockerfile's build stages are Node with bun copied in (the Nest and Prisma CLIs need `node` via their shebangs); the runtime image is `oven/bun:1.3-slim`, runs `bun dist/src/main.js` as the non-root `bun` user, and health-checks `/api/health`. `.env` is never copied into images (`.dockerignore`).

### Environment

`.env` (gitignored) needs: `PORT`, `DATABASE_URL`, `MAX_DB_CONNECTIONS`, `JWT_SECRET`, `JWT_EXPIRES_IN` (access token lifetime, default `15m`), `REFRESH_TOKEN_TTL_DAYS` (optional, default 30), `BCRYPT_SALT_ROUNDS`, and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_FIRST_NAME` / `SEED_ADMIN_LAST_NAME`. `SeedService` (`src/scripts/seed.ts`) creates that admin on boot if no admin exists — there is no separate seed command.

Optional: `RATE_LIMIT_PER_MINUTE` (default 120), `AUTH_RATE_LIMIT_PER_MINUTE` (default 10, login/register), `TRUST_PROXY` (Express "trust proxy" — set it behind a load balancer, or every client shares the balancer's IP for rate limiting), `CORS_ORIGINS` (comma-separated; CORS is off when unset), `SCHEDULED_JOBS` (`off` disables the cron jobs), `SMTP_URL` (`smtp(s)://user:pass@host:port`; without it emails are only logged), `MAIL_FROM` (default `Trek <no-reply@trek.local>`), `MAIL_TRANSPORT=log` (log even when `SMTP_URL` is set), `AGENT_TOKEN_EXPIRES_IN` (agent token lifetime, default `15m`), `APP_URL` (frontend base URL: verification and reset emails then link to `<APP_URL>/verify-email?token=…` and `/reset-password?token=…`; without it they show the bare code).

### E2E test database

E2E tests never touch the dev database. They use `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the database name (`test/test-db.ts`). Jest's global setup creates that database if missing and runs `prisma migrate deploy`; `createTestApp()` in `test/utils.ts` boots the app through `configureApp()` and truncates tables (refusing any database not ending in `_test`). Tests run serially (`maxWorkers: 1`). **When adding a model, add its table to the TRUNCATE list in `test/utils.ts`.** `test/setup-env.ts` raises the rate limits so suites aren't throttled (`test/hardening.e2e-spec.ts` boots its own apps with low limits) and turns scheduled jobs off (`test/jobs.e2e-spec.ts` calls them directly), and forces `MAIL_TRANSPORT=log` — `app.get(Mailer)` is then a `LogMailer` whose `sent` array tests can inspect. Some `@nestjs/*` packages ship ESM only; add any new one to `transformIgnorePatterns` in both `package.json` and `test/jest-e2e.json`.

The e2e Jest config runs the `@nestjs/swagger` CLI plugin through `test/swagger-plugin.transformer.js` (options read from `nest-cli.json`), so tests see the same OpenAPI metadata as `nest build`.

## Architecture

### Request pipeline (`src/app.setup.ts`)

`configureApp()` is shared by `main.ts` and the e2e tests — put global app configuration there, not in `main.ts`. It applies `TRUST_PROXY`, helmet (default CSP minus `upgrade-insecure-requests`, which breaks Swagger UI over HTTP) and optional CORS, sets the `api` global prefix and registers, in order:

1. **`IdempotencyInterceptor`** (outermost) — stores and replays the final enveloped body.
2. **`EnvelopeInterceptor`** (`common/http/`) — wraps successful responses as `{ data }`, or `{ data, pagination }` when a controller returns a `Page` (build one with `toPage()` from `common/http/page.ts`).
3. **`ApiExceptionFilter`** (`common/filters/`) — every error leaves as `{ statusCode, error: { code, message, details? } }`. Known Prisma errors are mapped in `prisma-errors.ts` (P2025→404, P2002→409 `ALREADY_EXISTS`, P2003→400 `INVALID_REFERENCE`, P2034→409 `BOOKING_CONFLICT`); anything unexpected becomes a logged 500 `INTERNAL_ERROR`.
4. **`ValidationPipe`** — whitelist + forbidNonWhitelisted + implicit conversion; failures become `VALIDATION_FAILED` with per-field `details` (dotted paths for nested fields).

**Rate limiting** (`src/rate-limit/`) runs before all of that as a global guard (`RateLimitGuard`, `@nestjs/throttler`). One budget per minute per *user* across the whole API (the bearer token is verified, so forged ids can't mint budgets), per IP when anonymous or the token is invalid — the agent serves many users from one IP. `@StrictRateLimit()` adds the tighter `auth` limit (login, register). A 429 is `TOO_MANY_REQUESTS` with a `Retry-After` header and `details.retryAfterSeconds`; `openapi.ts` documents it on every route. Counters are in memory, per instance — multiple instances need a shared `storage` (e.g. Redis).

**Scheduled jobs** (`src/jobs/maintenance.service.ts`, `@nestjs/schedule`, UTC): hourly purge of idempotency keys older than 24h; daily purge of refresh tokens that expired or were revoked over a day ago, and of account codes a day after they expired or were used; hourly completion of PLANNED itineraries whose `endDate` is before today (→ `COMPLETED`, plus a system `COMPLETED` event). Every instance runs them, so each job must stay safe to run concurrently (deletes, conditional `updateMany`); a run is skipped while the previous one is still going. Keep job logic in plain methods so tests can call them, and wrap cron handlers in `JobRunner.run()` (honours `SCHEDULED_JOBS=off`, prevents overlap, logs failures).

**Emails** (`src/email/`): transactional emails go through an outbox. Queue them with `queueEmail(tx, userId, to, template(...))` (or `outboxData()` in a nested create) **inside the transaction of the change they report**, so a rolled-back change never emails anyone. Templates (`templates.ts`) render text + HTML at queue time and must escape every interpolated value in HTML (`escapeHtml`). `EmailOutboxService` sends due emails every minute: each is claimed with a compare-and-set on `nextAttemptAt` (also a 5-minute lease, so a crashed sender's emails are retried — delivery is at-least-once), retried after 1m/5m/30m/2h/12h, then marked `FAILED`; sent/failed rows are purged after 30 days. Itinerary emails go to the owner even when an admin acted. `Mailer` is the provider interface: `SmtpMailer` (Nodemailer) when `SMTP_URL` is set, else `LogMailer`. Current emails: welcome (with verification code), verify email, email changed (to the old address), password reset, password changed, itinerary confirmed/cancelled/completed.

**Health** (`src/health/`): `GET /api/health` (liveness, no dependencies) and `GET /api/health/ready` (database within 2s, else 503 `SERVICE_UNAVAILABLE`). Public and exempt from rate limiting.

### Error codes

Clients and the agent branch on `error.code`, never on messages. Codes live in `common/http/api-error.ts`. Throw Nest HTTP exceptions with `apiError(ErrorCode.X, 'message')` when a specific code matters (e.g. `new ConflictException(apiError(ErrorCode.ROOMS_UNAVAILABLE, '...'))`); a plain-message exception gets a code derived from its status. New domain failure → add a code there.

### OpenAPI

`src/openapi.ts` builds the spec. Operation ids are `<resource>_<method>` (e.g. `itineraries_confirm`) — they become tool/method names in generated clients and the agent, so keep controller method names stable and meaningful. Documentation is mostly inferred by the swagger CLI plugin from `*.dto.ts`, `*.entity.ts` and `*.types.ts` files (JSDoc comments included), so response shapes are described by classes in each module's `entities/`. Use the decorators in `common/http/api-response.decorators.ts`: `@ApiDataResponse(Entity)`, `@ApiPageResponse(Entity)`, `@ApiErrorResponses([statuses], { [status]: 'description (CODE)' })`. `test/openapi.e2e-spec.ts` verifies the spec.

### Auth

JWT bearer tokens (passport-jwt, bcryptjs). Roles: `USER`, `ADMIN`. Controllers apply `@UseGuards(JwtAuthGuard)` at class level; `@AdminOnly()` (`src/auth/decorators/`) adds the role guard and documents the 403 — it requires `JwtAuthGuard` to already apply. `@CurrentUser()` injects `{ id, email, role }`. Catalogue writes (destinations, hotels, airports, flights) are admin-only; user profiles, itineraries, travelers and preferences are scoped to the current user (admins can reach any user's), and other users' records are reported as **404, not 403**. Catalogue records still in use can't be deleted (409 `RESOURCE_IN_USE` via `assertNotInUse()` in `common/http/in-use.ts`), and capacity can't drop below what is booked (409 `CAPACITY_BELOW_BOOKINGS`).

**Sessions** (`RefreshTokensService`): login returns a short-lived access token (checked without a DB lookup, so it stays valid until it expires) and a refresh token, stored only as a SHA-256 hash. Each login is a token family; `POST /auth/refresh` spends the token and issues its successor, re-reading the user so role changes apply. A spent token presented again within 30s (`REUSE_GRACE_MS`) is treated as a retry and gets another successor; later, it revokes the whole family (401 `REFRESH_TOKEN_REUSED`). `logout` revokes one family, `logout-all` every family of the user; deleting a user cascades to their tokens.

**Agent tokens:** the web app exchanges the user's access token at `POST /auth/agent-token` for a short-lived JWT (`AGENT_TOKEN_EXPIRES_IN`, default 15m, no refresh token) with `kind: 'agent'`, `sub` = the user and `role` always `USER` (an admin's agent has no admin rights). The PydanticAI service only ever holds this token. `JwtAuthGuard` refuses agent tokens (403 `AGENT_NOT_ALLOWED`) on every route not marked **`@AgentAllowed()`** — deny by default; the decorator also sets `x-agent-allowed: true` in the OpenAPI spec, which is what the agent's tools are generated from, and `test/openapi.e2e-spec.ts` pins that list. Agents may search and read the catalogue, read the profile, preferences, travelers and itineraries, and create/edit/delete **drafts**; confirm, cancel and all account/admin routes stay with the user (the service also stops agents deleting cancelled trips). `@CurrentUser()` carries `agent: true`; itinerary events record `viaAgent`; the agent has its own rate-limit budget (`agent:<userId>`). Only add `@AgentAllowed()` to routes that can't book, cancel, pay or change the account.

**Account security** (`AccountService`, `account-tokens.ts`): emailed single-use codes live in `AccountToken` (SHA-256 hashed via `common/helpers/secrets.ts`, like refresh tokens), each bound to a purpose and to the address it was sent to. Email verification: the welcome email carries the first code (48h); `verify-email` sets `User.emailVerifiedAt`; changing the email clears it, sends a code to the new address and a notice to the old one; `resend-verification` (409 `EMAIL_ALREADY_VERIFIED`). Verification is **not enforced** anywhere yet. Password reset: `forgot-password` always answers 204 (no account enumeration), keeps only the newest code (1h); `reset-password` also verifies the email. `change-password` needs the current password (400 `INVALID_CREDENTIALS`, not 401, so clients don't drop the session) and returns a new session. Any password change revokes every refresh token and emails the owner. Code emails are limited to one per purpose per minute per account. `change-password` is deliberately not `@Idempotent` (the store would hash a body holding passwords). Passwords are 8–72 characters on the new endpoints (bcrypt ignores bytes past 72).

### Domain

- **Catalogue:** `Destination` → `Hotel`, `Airport`; `Flight` links two airports. List endpoints support search/filtering (hotel search can filter by real availability for given dates).
- **Itineraries:** an `Itinerary` (`DRAFT → PLANNED → CANCELLED`, also `COMPLETED`) has `ItineraryHotel` stays and `ItineraryFlight` bookings (`HELD → CONFIRMED → CANCELLED`). Items snapshot their price/currency when added. Items can only be added/removed while `DRAFT`; availability is checked on add but only **reserved on confirm**.
- **Confirm / cancel** (`ItinerariesService`) run inside `inSerializableTx()`: Serializable isolation, retried up to 3 times on write conflicts (P2034, or a `40001` / `TransactionWriteConflict` cause from adapter-pg at commit), then `BOOKING_CONFLICT`. Confirm is all-or-nothing at current prices.
- **Safe confirm:** `Itinerary.version` goes up with every change. **Every draft change runs in a transaction that calls `touchDraft(tx, id)` first** — it bumps the version only while the trip is still `DRAFT`, under the row lock, so an edit can't slip into a trip confirmed meanwhile (409 `INVALID_STATUS`). `GET /itineraries/:id/quote` (agent-allowed, reserves nothing) prices every item at current catalogue prices via `priceItems()` — the same function confirm uses — and returns `version`, `totals`, `bookable` and `issues` (each with the error code confirm would give). Confirm **requires** `{ expectedVersion, expectedTotals }` from the quote: a different version → 409 `ITINERARY_CHANGED`, different totals (compared as decimals, same currencies) → 409 `PRICE_CHANGED` with `currentTotals`; both are checked before anything is reserved. Tests confirm via `ctx.reviewed(token, tripId)` (in `test/utils.ts`), which reads the quote like a client would.
- **Activity log:** every successful itinerary change writes an `ItineraryEvent` (`CREATED`, `UPDATED`, `HOTEL_ADDED`/`_REMOVED`, `FLIGHT_ADDED`/`_REMOVED`, `CONFIRMED`, `CANCELLED`, and `COMPLETED` from the scheduled job) **in the same transaction** as the change — use `recordEvent()` / `eventData()` from `src/itineraries/itinerary-events.ts`, inside `tx` or a batch `$transaction`. Events store the actor (id, nulled if the account is deleted, plus role; both null = the system, passed as `SYSTEM`) and a JSON `details` copy of the relevant facts (names, dates, prices as decimal strings), so history stays readable after items or catalogue records change. Read via `GET /itineraries/:id/events`, newest first. When adding a new itinerary action, add an event type for it.
- **`InventoryService`** is the single place that answers "is there room?" and holds/releases inventory. Hotel rooms are derived from overlapping CONFIRMED stays with a sweep-line peak (checkouts free rooms before same-day check-ins); flights have an admin-set `totalSeats` capacity and an `availableSeats` counter, decremented atomically with a conditional `updateMany`; `setFlightCapacity()` changes both in one SQL statement so concurrent bookings are never lost. Its methods accept an optional transaction client (`db`) — pass `tx` when calling inside a transaction. External providers (Amadeus, Duffel…) are meant to implement this same interface later.
- **Profile:** `UserPreferences` (`/users/me/preferences`: home airport, currency, budget, min hotel rating, default traveler count, notes — the defaults the agent plans with) and `Traveler` (name, date of birth, nationality). Flight bookings can name travelers; their count must match `passengers`. **No passport or other sensitive identity data** until real airline integrations require it.

### Idempotency (`src/idempotency/`)

Stripe-style `Idempotency-Key` header on authenticated POST routes marked `@Idempotent()` — mark every new non-idempotent POST with it. Keys are scoped per user and fingerprinted by method, path and a hash of the body (`stableStringify`). A repeat returns the stored response with `Idempotent-Replayed: true`; same key with a different request → 422 `IDEMPOTENCY_KEY_REUSED`; still running → 409 `IDEMPOTENCY_IN_PROGRESS`. Completed keys live 24h, abandoned in-progress locks expire after 60s, and failed requests release their key so they can be retried.

### Conventions

- Module layout: `controller`, `service`, `dto/` (class-validator input), `entities/` (response classes for OpenAPI), `types/` (query param classes). Shared code lives in top-level `common/` (imported as `common/...`); generated Prisma code is imported from `generated/prisma/client` via relative paths.
- Paginated lists: `getPaginationParams()` + `prisma.$transaction([findMany, count])` + `toPage()`.
- Money is `Decimal`; trip and stay dates are calendar days stored as UTC midnight (`toDateOnly()` in `common/helpers/date.helpers.ts`).
- Prettier: single quotes, trailing commas.
- Comments explain *why*, briefly; match the existing density.

## Agent (`agent/`)

Python 3.13, **uv**, PydanticAI 2, FastAPI. A model on **OpenRouter** through PydanticAI's OpenAI-compatible `OpenAIChatModel` + `OpenAIProvider(base_url=...)`; `AGENT_MODEL` picks it. Commands, run from `agent/`: `uv sync`, `uv run trek-agent` (serves `POST /chat` on :8000), `uv run pytest`, `uv run ruff check .`, `uv run ruff format .`. CI's `agent` job runs lint, format check and tests.

**Layers** (in `src/trek_agent/`, calling downwards only): `api/` (routers, schemas, `dependencies.py`, `error_handlers.py` — the only FastAPI code besides the composition root `app.py`) → `services/` (business flow, raises domain errors from `core/errors.py`) → `repositories/` (storage behind interfaces), `clients/trek/` (HTTP to Trek) and `assistant/` (the PydanticAI agent). `core/` holds config, domain errors and the shared resources (`resources.py`), with no web-framework code. Routers stay thin and never build error responses; every error leaves as `{"error": {"code", "message"}}`, Trek's shape. `agent/README.md` has the full map and "how to add an endpoint / a tool".

- **Auth:** `POST /chat` takes the user's **agent token** as its bearer token (the web app gets it from `POST /api/auth/agent-token`); `ChatService` passes it to every Trek call and never sees the user's own token, so the API's agent rules (drafting only) hold whatever the model does. It checks the token with `/auth/me` before paying for any model call; conversations belong to that user (another user's id is `CONVERSATION_NOT_FOUND`, 404) and live in `InMemoryConversationRepository` — swap in another `ConversationRepository` in `core/resources.py` for durability.
- **Tools** (`assistant/tools/`: `catalogue.py`, `trips.py`, `profile.py`): hand-written, one per Trek operation open to agents, wrapped in `@reports_errors`, returning `presenters.py` views (keep them compact: the model reads them every turn). Docstrings are the tool descriptions. Trek errors return to the model as `{"error": {"code", ...}}`; `AgentTokenRejected` aborts the run so `/chat` answers 401. **When a Trek route gains `@AgentAllowed()` or changes its response shape, update the tool** — `uv run python scripts/check_tools.py <agent token>` runs every tool against a real Trek (no LLM).
- **Client** (`clients/trek/`): unwraps `{ data }`, raises `TrekApiError(code)`, retries network errors and 429s (`Retry-After`), and sends an `Idempotency-Key` on POSTs that's kept across retries.
- **Instructions** (`assistant/instructions.py`): plan with the user's preferences, never invent results or ids, quote before stating a total, never book (the user confirms in the app), how to react to each error code. Today's date is added per run (`assistant/agent.py`, which also holds `USAGE_LIMITS`).
- **Tests** mirror the layers (`tests/api`, `services`, `repositories`, `clients`, `assistant`) and use `tests/fakes.py`: a scripted `FunctionModel` (`ScriptedModel`) and a fake Trek API (`FakeTrek`, an httpx `MockTransport`) — no network, no key. Test business flow at the service level; keep `tests/api` to HTTP concerns.

## Git workflow

Branch off an up-to-date `main` (verify against GitHub — `git fetch https://github.com/mgalen007/trek.git main`, since SSH may be unavailable), make small Conventional Commits (`feat:`, `fix:`, `test:`, `ci:`, `refactor:`, `style:`, `docs:`; `feat!:` for breaking changes), and stop. The maintainer pushes, opens the PR, reviews and merges. One branch/PR per roadmap item. Schema changes usually land as their own commit (`feat: schema for …`) before the feature commit.

## Roadmap

- **Phase 1** — itineraries and all-or-nothing bookings. Done.
- **Phase 2** — search and filtering. Done.
- **Phase 3 — groundwork for the AI agent.** Done: response envelope + error codes, OpenAPI, user preferences + travelers, Idempotency-Key, refresh tokens, itinerary activity log.
- **Phase 4 — production hardening.** Done: health checks, helmet, CORS, rate limiting, Docker, scheduled jobs, transactional emails, password change/reset and email verification, README.
- **Before the agent:** done: agent tokens (drafting only; the user confirms), safe confirm (quote, version and expected totals), sample catalogue. Request IDs are deferred until the agent makes real calls.
- **Phase 5 — real providers and payments:** external inventory (Amadeus/Duffel) behind `InventoryService`, payments.
- **The PydanticAI agent** (`agent/`, first version done: tools, chat endpoint, tests). Runs in Docker Compose. Next: streaming replies, shared conversation storage, request IDs on the API. It plans trips by calling this API as tools (operation ids → tool names, `error.code` for recovery, `Idempotency-Key` for safe retries, user preferences and travelers as planning context). Keep it in mind when designing endpoints: every operation should be self-describing in OpenAPI and safe for an automated client to retry.
