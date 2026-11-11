# syntax=docker/dockerfile:1

# ---- build: the locked dependencies and the app, installed into /app/.venv
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY README.md ./
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

# ---- runtime: just Python and the virtualenv, as a non-root user. Same
# Python as the build image, so the virtualenv's interpreter path matches.
FROM python:3.13-slim-bookworm AS runtime
RUN useradd --create-home --uid 1000 agent
COPY --from=build --chown=agent:agent /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    AGENT_HOST=0.0.0.0 \
    AGENT_PORT=8000
USER agent
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://localhost:{os.environ['AGENT_PORT']}/health\", timeout=4)"]
CMD ["trek-agent"]
