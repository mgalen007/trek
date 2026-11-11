# Changelog

All notable changes to Trek are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/): while the version is `0.x`, the API may still change in breaking ways between minor versions.

One version covers the whole repository: the API and the agent in `agent/` are released together.

## [0.1.0] - 2026-11-11

The first release: a travel booking and itinerary-planning API, and an AI assistant that plans trips through it. Ready for development and demos, not yet for production (see [Known limitations](#known-limitations)).

### API

**Catalogue and search**
- Destinations, hotels, airports and flights, managed by admins.
- Hotel search by destination, price, rating and real room availability for given dates; flight search by route, date, passengers and price; sorting and pagination.
- Admins can't delete records still in use or lower capacity below what's booked.

**Trips and bookings**
- Draft itineraries with hotel stays and flights; items snapshot their price when added.
- Quotes: every item at current prices, totals per currency, and anything that would block booking.
- Confirm reserves every room and seat at once or nothing, only if the trip is still the version and price the user reviewed (`ITINERARY_CHANGED`, `PRICE_CHANGED`). Concurrent bookings can't oversell.
- Cancel releases everything; past trips are completed automatically.
- An activity log of every change to a trip, with who made it (the user, an admin, the assistant or the system).

**Accounts**
- Registration, login, short-lived access tokens with rotating refresh tokens (reuse detection, log out, log out everywhere).
- Email verification, password reset and password change.
- Travel preferences and saved travelers.
- Agent tokens: a short-lived token for the user's AI assistant that can search, read and draft, but never book, cancel or change the account.

**For clients and automation**
- Every response is `{ data }` (with `pagination` on lists); every error is `{ statusCode, error: { code, message, details? } }`.
- A complete OpenAPI spec at `/api/docs`, with stable operation ids; agent-callable operations are marked `x-agent-allowed`.
- `Idempotency-Key` support on POST requests, so retries never act twice.
- Per-user rate limits (stricter on login and registration) with `Retry-After`.

**Operations**
- Health checks (`/api/health`, `/api/health/ready`), security headers, optional CORS.
- Scheduled jobs: clean-up of expired keys, tokens and codes; completing past trips.
- Transactional emails (welcome, booking confirmed, cancelled and completed, password and email changes) through an outbox with retries; SMTP or log-only.
- Docker image and a Compose stack (PostgreSQL, Mailpit, migrations, sample data, API).
- A sample catalogue: 17 destinations across Africa, the Middle East, Europe and the Americas, with hotels, airports and 90 days of flights.

### Agent (`agent/`)

- A PydanticAI assistant behind a FastAPI service (`POST /chat`), using any tool-calling model on OpenRouter.
- 14 tools covering search, drafts and quotes. It plans with the user's preferences, quotes before stating prices, and leaves confirming to the user.
- Uses only the user's agent token, so the API's rules hold whatever the model does. API errors reach the model with their code, so it can recover.
- Conversations per user; a cap on model calls per message.

### Known limitations

- **The assistant has only been tested against a scripted model,** not yet a real one at scale.
- **Rate-limit counters and assistant conversations are kept in memory:** run a single instance, and expect conversations to be lost on restart.
- **No payments:** confirming reserves inventory without charging.
- **Sample data only:** no real flight or hotel suppliers yet.
- **Email verification isn't required** for booking.
- **No currency conversion:** prices stay in each supplier's currency, and sorting compares raw amounts.
- **Trips cover a single destination;** flights are direct only (connections are planned leg by leg).
- **The assistant doesn't stream its replies** and has no Docker image yet.

[0.1.0]: https://github.com/mgalen007/trek/releases/tag/v0.1.0
