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

SQLAlchemy 2.x provides the async application engine and schema metadata. Alembic revisions live in `alembic/versions/`; create one with `bun run db:migration:create -- -m "description"`. Production runs `alembic upgrade head` through the one-shot migration container before replacing the API container. A database previously initialized through `app_migrations` is stamped at the matching Alembic revision without recreating its tables.

Use either `DATABASE_URL` or `DATABASE_URL_FILE`, never both. Production uses `DATABASE_SSL_MODE=verify-full` with `DATABASE_SSL_CA_FILE`; local development uses `disable`. Rate limiting is controlled with `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, and `RATE_LIMIT_WRITE_MAX_REQUESTS`.

The frontend-facing Discord authentication, user profile, review CRUD, and review voting APIs
are implemented. Configure `AUTH_SECRET`, `DISCORD_CLIENT_ID`, and `DISCORD_CLIENT_SECRET` before
using Discord login.

## Administration and legacy import

Administrator Discord IDs are seeded into the `admin_discord_ids` table by Alembic. A matching
Discord login receives `users.admin=true`; removing an ID from the allowlist takes effect on the
next login. Admin endpoints support comment search, hide/restore, deletion, and Mongo-style JSON
comment import. The standalone `apps/admin` web application exposes these tools only when
`/api/user/me` reports `admin=true`. Configure `ADMIN_REDIRECT_URL` with its exact Discord OAuth
callback URL; production serves the app at `/admin/`.

The importer accepts JSON arrays, `{ "comments": [...] }`, or JSONL from the admin web UI. It maps
legacy `_id`, `productId`, `userId`, timestamps, disabled state, and vote-user arrays. Stored
`upvotes` and `downvotes` counts are ignored because current counts are derived from vote rows.
