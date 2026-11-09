# syntax=docker/dockerfile:1

# Build stages run on Node with bun copied in: the Nest and Prisma CLIs start
# through `#!/usr/bin/env node`, which the bun images can't satisfy.
FROM oven/bun:1.3 AS bun

# ---- deps: every dependency, cached until the lockfile changes
FROM node:22-slim AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
# bunx is just bun under another name; the bun image ships it as a symlink.
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- build: compiles the app. docker-compose also runs migrations from here,
# since the Prisma CLI is a dev dependency.
FROM deps AS build
COPY . .
RUN bunx prisma generate && bun run build

# ---- prod-deps: runtime dependencies only
FROM node:22-slim AS prod-deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
# --omit=peer: @prisma/client lists the Prisma CLI and TypeScript as optional
# peers, which bun would otherwise install (~280MB the app never loads).
RUN bun install --frozen-lockfile --production --omit=peer

# ---- runtime: the compiled app on bun, as a non-root user
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER bun
EXPOSE 3000
# Liveness only: a database outage shouldn't get the container restarted.
# Startup can take ~15s on slow machines, hence the start period.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "dist/src/main.js"]
