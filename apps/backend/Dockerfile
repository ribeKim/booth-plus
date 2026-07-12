# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:0.8.11-python3.13-bookworm-slim AS dependencies

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY apps/backend/pyproject.toml apps/backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim-bookworm AS runtime
ENV PATH=/app/.venv/bin:$PATH PYTHONPATH=/app/src PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=3000
RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=dependencies /app/.venv /app/.venv
COPY --chown=app:app apps/backend/src ./src
COPY --chown=app:app apps/backend/scripts ./scripts
COPY --chown=app:app apps/backend/alembic.ini ./alembic.ini
COPY --chown=app:app apps/backend/alembic ./alembic
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health')"]

STOPSIGNAL SIGTERM

CMD ["uvicorn", "booth_plus.app:create_app", "--factory", "--app-dir", "src", "--host", "0.0.0.0", "--port", "3000", "--proxy-headers", "--forwarded-allow-ips", "*"]
