# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Trek is a travel booking and itinerary-planning REST API: NestJS 11, Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) on PostgreSQL. Users browse destinations, hotels, airports and flights, build a draft itinerary, and confirm it to reserve every room and seat at once.

The API is being shaped to be driven by an **AI agent built with PydanticAI** (a separate Python service, not in this repo yet). Design decisions favour what an agent needs: a predictable response shape, machine-readable error codes, a complete OpenAPI spec with stable operation ids, and retry-safe mutations.

## Tooling

Use **bun / bunx** for everything — never npm, npx or node directly.

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

# Single test file / single test
bun run test -- src/inventory/inventory.service.spec.ts
bun run test -- -t "retries P2034"
bun run test:e2e -- test/idempotency.e2e-spec.ts
```

CI (`.github/workflows/ci.yml`) runs lint:check → typecheck → build → OpenAPI export, then unit + e2e tests against a Postgres 17 service. Run that same sequence locally before committing.

### Environment

`.env` (gitignored) needs: `PORT`, `DATABASE_URL`, `MAX_DB_CONNECTIONS`, `JWT_SECRET`, `JWT_EXPIRES_IN` (access token lifetime, default `15m`), `REFRESH_TOKEN_TTL_DAYS` (optional, default 30), `BCRYPT_SALT_ROUNDS`, and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_FIRST_NAME` / `SEED_ADMIN_LAST_NAME`. `SeedService` (`src/scripts/seed.ts`) creates that admin on boot if no admin exists — there is no separate seed command.

Optional: `RATE_LIMIT_PER_MINUTE` (default 120), `AUTH_RATE_LIMIT_PER_MINUTE` (default 10, login/register), `TRUST_PROXY` (Express "trust proxy" — set it behind a load balancer, or every client shares the balancer's IP for rate limiting), `CORS_ORIGINS` (comma-separated; CORS is off when unset).

### E2E test database

E2E tests never touch the dev database. They use `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the database name (`test/test-db.ts`). Jest's global setup creates that database if missing and runs `prisma migrate deploy`; `createTestApp()` in `test/utils.ts` boots the app through `configureApp()` and truncates tables (refusing any database not ending in `_test`). Tests run serially (`maxWorkers: 1`). **When adding a model, add its table to the TRUNCATE list in `test/utils.ts`.** `test/setup-env.ts` raises the rate limits so suites aren't throttled; `test/hardening.e2e-spec.ts` boots its own apps with low limits.

The e2e Jest config runs the `@nestjs/swagger` CLI plugin through `test/swagger-plugin.transformer.js` (options read from `nest-cli.json`), so tests see the same OpenAPI metadata as `nest build`.

## Architecture

### Request pipeline (`src/app.setup.ts`)

`configureApp()` is shared by `main.ts` and the e2e tests — put global app configuration there, not in `main.ts`. It applies `TRUST_PROXY`, helmet (default CSP minus `upgrade-insecure-requests`, which breaks Swagger UI over HTTP) and optional CORS, sets the `api` global prefix and registers, in order:

1. **`IdempotencyInterceptor`** (outermost) — stores and replays the final enveloped body.
2. **`EnvelopeInterceptor`** (`common/http/`) — wraps successful responses as `{ data }`, or `{ data, pagination }` when a controller returns a `Page` (build one with `toPage()` from `common/http/page.ts`).
3. **`ApiExceptionFilter`** (`common/filters/`) — every error leaves as `{ statusCode, error: { code, message, details? } }`. Known Prisma errors are mapped in `prisma-errors.ts` (P2025→404, P2002→409 `ALREADY_EXISTS`, P2003→400 `INVALID_REFERENCE`, P2034→409 `BOOKING_CONFLICT`); anything unexpected becomes a logged 500 `INTERNAL_ERROR`.
4. **`ValidationPipe`** — whitelist + forbidNonWhitelisted + implicit conversion; failures become `VALIDATION_FAILED` with per-field `details` (dotted paths for nested fields).

**Rate limiting** (`src/rate-limit/`) runs before all of that as a global guard (`RateLimitGuard`, `@nestjs/throttler`). One budget per minute per *user* across the whole API (the bearer token is verified, so forged ids can't mint budgets), per IP when anonymous or the token is invalid — the agent serves many users from one IP. `@StrictRateLimit()` adds the tighter `auth` limit (login, register). A 429 is `TOO_MANY_REQUESTS` with a `Retry-After` header and `details.retryAfterSeconds`; `openapi.ts` documents it on every route. Counters are in memory, per instance — multiple instances need a shared `storage` (e.g. Redis).

**Health** (`src/health/`): `GET /api/health` (liveness, no dependencies) and `GET /api/health/ready` (database within 2s, else 503 `SERVICE_UNAVAILABLE`). Public and exempt from rate limiting.

### Error codes

Clients and the agent branch on `error.code`, never on messages. Codes live in `common/http/api-error.ts`. Throw Nest HTTP exceptions with `apiError(ErrorCode.X, 'message')` when a specific code matters (e.g. `new ConflictException(apiError(ErrorCode.ROOMS_UNAVAILABLE, '...'))`); a plain-message exception gets a code derived from its status. New domain failure → add a code there.

### OpenAPI

`src/openapi.ts` builds the spec. Operation ids are `<resource>_<method>` (e.g. `itineraries_confirm`) — they become tool/method names in generated clients and the agent, so keep controller method names stable and meaningful. Documentation is mostly inferred by the swagger CLI plugin from `*.dto.ts`, `*.entity.ts` and `*.types.ts` files (JSDoc comments included), so response shapes are described by classes in each module's `entities/`. Use the decorators in `common/http/api-response.decorators.ts`: `@ApiDataResponse(Entity)`, `@ApiPageResponse(Entity)`, `@ApiErrorResponses([statuses], { [status]: 'description (CODE)' })`. `test/openapi.e2e-spec.ts` verifies the spec.

### Auth

JWT bearer tokens (passport-jwt, bcryptjs). Roles: `USER`, `ADMIN`. Controllers apply `@UseGuards(JwtAuthGuard)` at class level; `@AdminOnly()` (`src/auth/decorators/`) adds the role guard and documents the 403 — it requires `JwtAuthGuard` to already apply. `@CurrentUser()` injects `{ id, email, role }`. Catalogue writes (destinations, hotels, airports, flights) are admin-only; user profiles, itineraries, travelers and preferences are scoped to the current user (admins can reach any user's), and other users' records are reported as **404, not 403**. Catalogue records still in use can't be deleted (409 `RESOURCE_IN_USE` via `assertNotInUse()` in `common/http/in-use.ts`), and capacity can't drop below what is booked (409 `CAPACITY_BELOW_BOOKINGS`).

**Sessions** (`RefreshTokensService`): login returns a short-lived access token (checked without a DB lookup, so it stays valid until it expires) and a refresh token, stored only as a SHA-256 hash. Each login is a token family; `POST /auth/refresh` spends the token and issues its successor, re-reading the user so role changes apply. A spent token presented again within 30s (`REUSE_GRACE_MS`) is treated as a retry and gets another successor; later, it revokes the whole family (401 `REFRESH_TOKEN_REUSED`). `logout` revokes one family, `logout-all` every family of the user; deleting a user cascades to their tokens.

### Domain

- **Catalogue:** `Destination` → `Hotel`, `Airport`; `Flight` links two airports. List endpoints support search/filtering (hotel search can filter by real availability for given dates).
- **Itineraries:** an `Itinerary` (`DRAFT → PLANNED → CANCELLED`, also `COMPLETED`) has `ItineraryHotel` stays and `ItineraryFlight` bookings (`HELD → CONFIRMED → CANCELLED`). Items snapshot their price/currency when added. Items can only be added/removed while `DRAFT`; availability is checked on add but only **reserved on confirm**.
- **Confirm / cancel** (`ItinerariesService`) run inside `inSerializableTx()`: Serializable isolation, retried up to 3 times on write conflicts (P2034, or a `40001` / `TransactionWriteConflict` cause from adapter-pg at commit), then `BOOKING_CONFLICT`. Confirm is all-or-nothing at current prices.
- **Activity log:** every successful itinerary change writes an `ItineraryEvent` (`CREATED`, `UPDATED`, `HOTEL_ADDED`/`_REMOVED`, `FLIGHT_ADDED`/`_REMOVED`, `CONFIRMED`, `CANCELLED`) **in the same transaction** as the change — use `recordEvent()` / `eventData()` from `src/itineraries/itinerary-events.ts`, inside `tx` or a batch `$transaction`. Events store the actor (id, nulled if the account is deleted, plus role) and a JSON `details` copy of the relevant facts (names, dates, prices as decimal strings), so history stays readable after items or catalogue records change. Read via `GET /itineraries/:id/events`, newest first. When adding a new itinerary action, add an event type for it.
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

## Git workflow

Branch off an up-to-date `main` (verify against GitHub — `git fetch https://github.com/mgalen007/trek.git main`, since SSH may be unavailable), make small Conventional Commits (`feat:`, `fix:`, `test:`, `ci:`, `refactor:`, `style:`, `docs:`; `feat!:` for breaking changes), and stop. The maintainer pushes, opens the PR, reviews and merges. One branch/PR per roadmap item. Schema changes usually land as their own commit (`feat: schema for …`) before the feature commit.

## Roadmap

- **Phase 1** — itineraries and all-or-nothing bookings. Done.
- **Phase 2** — search and filtering. Done.
- **Phase 3 — groundwork for the AI agent.** Done: response envelope + error codes, OpenAPI, user preferences + travelers, Idempotency-Key, refresh tokens, itinerary activity log.
- **Phase 4 — production hardening.** Done: health checks, helmet, CORS, rate limiting. Next: Docker, scheduled jobs (e.g. purging expired idempotency keys and refresh tokens, completing past itineraries), emails.
- **Phase 5 — real providers and payments:** external inventory (Amadeus/Duffel) behind `InventoryService`, payments.
- **The PydanticAI agent:** a Python agent that plans and books trips by calling this API as tools (operation ids → tool names, `error.code` for recovery, `Idempotency-Key` for safe retries, user preferences and travelers as planning context). Keep it in mind when designing endpoints: every operation should be self-describing in OpenAPI and safe for an automated client to retry.
