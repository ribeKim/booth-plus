# BoothPlus backend

FastAPI + PostgreSQL backend managed with `uv`. Repository-level Bun scripts wrap the Python commands so the monorepo keeps one command surface.

## Local development

Requirements: Python 3.13, uv, Bun 1.3.1, and Docker.

```bash
uv sync --project apps/backend --frozen
docker compose up -d postgres
```

Set `DATABASE_URL=postgresql://booth_plus:booth_plus_dev@localhost:5432/booth_plus`, `DATABASE_SSL_MODE=disable`, and `CORS_ORIGINS`, then run:

```bash
bun run db:migrate
bun run dev:backend
```

Swagger UI, ReDoc, and the OpenAPI JSON endpoint are disabled. Health endpoints are:

- `GET /api/health`: process liveness
- `GET /api/health/storage`: PostgreSQL and schema readiness

## Validation

```bash
bun run test:backend
bun run lint:backend
bun run check
bun run docker:build:backend
```

SQL migrations live in `migrations/`. Each migration contains an `-- Up Migration` section and may contain a `-- Down Migration` section. Production runs only unapplied up migrations through the one-shot migration container.

Use either `DATABASE_URL` or `DATABASE_URL_FILE`, never both. Production uses `DATABASE_SSL_MODE=verify-full` with `DATABASE_SSL_CA_FILE`; local development uses `disable`. Rate limiting is controlled with `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, and `RATE_LIMIT_WRITE_MAX_REQUESTS`.

The database schema is present, but the authentication, product, review, vote, and batch-summary service APIs still need to be implemented.
