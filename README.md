# Trek

A travel booking and itinerary-planning API. Users browse destinations, hotels and flights, put together a draft trip, and confirm it to reserve every room and seat at once, or nothing.

Trek is built to be driven by an AI agent as much as by people: every response has the same shape, every error carries a machine-readable code, the OpenAPI spec is complete with stable operation ids, and mutations are safe to retry.

**Stack:** NestJS 11 · Prisma 7 · PostgreSQL 17 · Bun · Docker

## Contents

- [Features](#features)
- [Quick start with Docker](#quick-start-with-docker)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Using the API](#using-the-api)
- [Endpoints](#endpoints)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)

## Features

- **Catalogue search:** destinations, hotels (filter by price, rating and real room availability for given dates) and flights (by route, date, passengers and price).
- **Itineraries:** build a draft with hotel stays and flights, then **confirm** it to reserve everything in one all-or-nothing transaction, or **cancel** it to release everything. Concurrent bookings can't oversell a room or a seat.
- **Activity log:** every change to a trip is recorded with who made it, readable as a timeline.
- **Profiles:** travel preferences (home airport, currency, budget, minimum hotel rating…) and saved travelers to name on flight bookings.
- **Accounts:** short-lived access tokens with rotating refresh tokens (reuse detection, log out, log out everywhere), email verification, password reset and change.
- **Emails:** welcome, booking confirmed, cancelled and completed, password and email changes, delivered through a transactional outbox with retries.
- **Built for automated clients:** `{ data }` responses, `error.code` on every error, `Idempotency-Key` on POST requests, per-user rate limits with `Retry-After`.
- **Production basics:** health checks, security headers, CORS, scheduled maintenance jobs, Docker image and Compose stack, CI.

## Quick start with Docker

Requirements: Docker with Compose.

1. Create a `.env` file in the project root with at least:

   ```ini
   JWT_SECRET=change-me-to-a-long-random-string
   SEED_ADMIN_EMAIL=admin@example.com
   SEED_ADMIN_PASSWORD=change-me-too
   ```

2. Start everything:

   ```bash
   docker compose up --build
   ```

   Compose starts PostgreSQL, applies the database migrations, then starts the API. It also starts [Mailpit](https://mailpit.axllent.org/), which catches every email the API sends.

3. Open:

   | What | Where |
   |---|---|
   | API | http://localhost:3000/api |
   | Interactive docs (Swagger UI) | http://localhost:3000/api/docs |
   | OpenAPI spec (JSON) | http://localhost:3000/api/docs-json |
   | Health | http://localhost:3000/api/health/ready |
   | Email inbox (Mailpit) | http://localhost:8025 |

An admin account is created on first start from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Only admins can add destinations, hotels, airports and flights.

| Task | Command |
|---|---|
| Follow the API logs | `docker compose logs -f api` |
| Stop | `docker compose down` |
| Stop and delete the database | `docker compose down --volumes` |
| Use another port | `API_PORT=4000 docker compose up` |

The Compose database is separate from any local PostgreSQL and isn't exposed on your machine. Set `SMTP_URL` in `.env` to send real email instead of catching it in Mailpit.

## Local development

Requirements: [Bun](https://bun.sh) 1.3, Node.js 22 (used by the Nest and Prisma CLIs and by Jest), PostgreSQL 17.

```bash
bun install
bunx prisma generate                       # generate the database client
bunx prisma migrate dev                    # create and migrate the database from DATABASE_URL
bun run start:dev                          # watch mode on PORT (default 3000)
```

Use Bun for everything in this repository, not npm.

| Command | Purpose |
|---|---|
| `bun run start:dev` | Run with reload on change |
| `bun run build` | Compile to `dist/` |
| `bun run lint:check` | ESLint, zero warnings allowed (`bun run lint` fixes) |
| `bun run typecheck` | TypeScript |
| `bun run test` | Unit tests |
| `bun run test:e2e` | End-to-end tests against PostgreSQL |
| `bun run openapi:export` | Write the OpenAPI spec to `openapi.json` |
| `bunx prisma migrate dev --name <name>` | Create a migration after changing `prisma/schema.prisma` |

Without `SMTP_URL`, emails are written to the log instead of being sent.

## Configuration

Settings are read from environment variables, or from `.env` in development.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes (not with Compose) | | PostgreSQL connection string |
| `JWT_SECRET` | yes | | Signs access tokens |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | yes | | Admin account created on first start |
| `SEED_ADMIN_FIRST_NAME`, `SEED_ADMIN_LAST_NAME` | yes (not with Compose) | | Its name |
| `BCRYPT_SALT_ROUNDS` | yes (not with Compose) | Compose: `12` | Password hashing cost |
| `PORT` | | `3000` | HTTP port |
| `MAX_DB_CONNECTIONS` | | | Database pool size |
| `JWT_EXPIRES_IN` | | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | | `30` | Refresh token lifetime |
| `RATE_LIMIT_PER_MINUTE` | | `120` | Requests per minute per user (per IP when anonymous) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | | `10` | Stricter limit on login, registration, password and verification routes |
| `TRUST_PROXY` | | | Set behind a load balancer (e.g. `1`) so rate limits see real client IPs |
| `CORS_ORIGINS` | | | Comma-separated browser origins; CORS is off when unset |
| `SMTP_URL` | | | `smtp(s)://user:pass@host:port`; without it emails are only logged |
| `MAIL_FROM` | | `Trek <no-reply@trek.local>` | Sender address |
| `AGENT_TOKEN_EXPIRES_IN` | | `15m` | Lifetime of tokens for the AI agent |
| `APP_URL` | | | Frontend URL; verification and reset emails then contain links instead of bare codes |
| `SCHEDULED_JOBS` | | | `off` disables the background jobs |

## Using the API

Every route is under `/api`. The [Swagger UI](http://localhost:3000/api/docs) documents each one, including request bodies, responses and error codes, and lets you try them.

### Responses

Successes are wrapped in `data`, with `pagination` on lists:

```json
{ "data": [ … ], "pagination": { "page": 1, "skip": 0, "limit": 15, "total": 42, "totalPages": 3 } }
```

Errors always look like this. Branch on `error.code`, never on the message:

```json
{ "statusCode": 409, "error": { "code": "ROOMS_UNAVAILABLE", "message": "Only 1 room(s) left at Hill View for those dates" } }
```

### Signing in

`POST /api/auth/login` returns a short-lived `accessToken`, sent as `Authorization: Bearer <token>`, and a `refreshToken`. Exchange the refresh token at `POST /api/auth/refresh` before the access token expires. Each refresh returns a new refresh token, and the old one stops working. Reusing a spent refresh token signs out that session everywhere.

### Booking a trip

```bash
API=http://localhost:3000/api
TOKEN=...   # accessToken from /auth/login

# 1. Find a hotel with rooms free on your dates
curl "$API/hotels?destinationId=<id>&checkIn=2027-03-01&checkOut=2027-03-04&rooms=1" -H "Authorization: Bearer $TOKEN"

# 2. Start a draft trip
curl -X POST $API/itineraries -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Kigali in March","destinationId":"<id>","startDate":"2027-03-01","endDate":"2027-03-04"}'

# 3. Add a hotel stay (and flights, with POST /itineraries/<tripId>/flights)
curl -X POST $API/itineraries/<tripId>/hotels -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"hotelId":"<id>","checkInDate":"2027-03-01","checkOutDate":"2027-03-04","rooms":1}'

# 4. Confirm: reserves every room and seat at current prices, or nothing
curl -X POST $API/itineraries/<tripId>/confirm -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: confirm-<tripId>-1"
```

Availability is checked when items are added, but only reserved when the trip is confirmed. A confirmed trip becomes `PLANNED`, can be cancelled to release everything, and becomes `COMPLETED` automatically after its last day.

### Retrying safely

Send an `Idempotency-Key` header (for example a UUID) with POST requests. Repeating a request with the same key within 24 hours returns the original response, marked `Idempotent-Replayed: true`, instead of doing the work twice.

### The AI agent

The web app gets a token for the user's assistant from `POST /api/auth/agent-token`, using the user's own access token, and passes it to the agent service. The agent then acts as that user, with limits enforced by the API:

- it can search the catalogue, read the user's profile, preferences, travelers and trips, and create, edit and delete **draft** trips;
- it can't confirm or cancel trips, change the account, or use admin rights: those answer `403 AGENT_NOT_ALLOWED`. The user confirms with their own login;
- its token expires after 15 minutes and has no refresh token: the web app requests a new one;
- the trip history shows which changes the assistant made (`viaAgent`).

The operations it may call are marked `x-agent-allowed: true` in the OpenAPI spec.

### Rate limits

Each signed-in user has a budget of requests per minute across the API; anonymous requests share one per IP. Over the limit, the API answers `429 TOO_MANY_REQUESTS` with a `Retry-After` header.

## Endpoints

Admin-only routes are marked (admin). Users can only see and change their own profile, trips, travelers and preferences; anyone else's are reported as not found.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `GET /auth/me` |
| Account | `POST /auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password` |
| Users | `GET /users` (admin), `GET`, `PUT`, `DELETE /users/:id` |
| Preferences | `GET`, `PUT /users/me/preferences` |
| Travelers | `GET`, `POST /travelers`, `GET`, `PUT`, `DELETE /travelers/:id` |
| Destinations | `GET /destinations`, `GET /destinations/:id`, `/destinations/:id/hotels`, `/destinations/:id/airports`; create, update, delete (admin) |
| Hotels | `GET /hotels`, `GET /hotels/:id`; create, update, delete (admin) |
| Airports | `GET /airports`, `GET /airports/:id`; create, update, delete (admin) |
| Flights | `GET /flights`, `GET /flights/:id`; create, update, delete (admin) |
| Itineraries | `GET`, `POST /itineraries`, `GET`, `PUT`, `DELETE /itineraries/:id`, `GET /itineraries/:id/events`, `POST`/`DELETE` hotel stays and flights, `POST /itineraries/:id/confirm`, `/itineraries/:id/cancel` |
| Health | `GET /health`, `GET /health/ready` |

## Testing

```bash
bun run test        # unit tests
bun run test:e2e    # end-to-end tests
```

The end-to-end tests use a separate database: `DATABASE_URL` with `_test` appended to its name, or `TEST_DATABASE_URL`. It's created and migrated automatically and emptied before each test file. The tests refuse to run against any database whose name doesn't end in `_test`.

CI (GitHub Actions) runs lint, type-checking, the build, the OpenAPI export, both test suites against PostgreSQL 17, and starts the Docker Compose stack to check it becomes healthy.

## Project layout

```
src/
  auth/          sign-in, sessions, account security
  users/         profiles · preferences/ · travelers/
  destinations/  hotels/  airports/  flights/     the catalogue
  itineraries/   trips, bookings and the activity log
  inventory/     availability and reservations of rooms and seats
  email/         templates, outbox and mail delivery
  jobs/          scheduled maintenance
  idempotency/   rate-limit/   health/
common/          shared HTTP envelope, errors, filters and helpers
prisma/          schema and migrations
test/            end-to-end tests
```

Contributor notes (architecture, conventions, git workflow) are in [CLAUDE.md](CLAUDE.md).

## Roadmap

- **Done:** itineraries and bookings, search, the agent groundwork (response envelope, error codes, OpenAPI, preferences and travelers, idempotency, refresh tokens, activity log), production hardening (health checks, security headers, rate limiting, Docker, scheduled jobs, emails, account security).
- **Next:** agent access tokens are done; then price and content checks on confirm, sample catalogue data, request IDs.
- **Then:** an AI agent built with PydanticAI that plans and books trips through this API; real flight and hotel suppliers (Amadeus or Duffel) and payments.

## License

Not licensed for reuse (`UNLICENSED` in `package.json`).
