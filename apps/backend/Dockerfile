# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.1-alpine AS dependencies

WORKDIR /workspace

COPY package.json bun.lock bunfig.toml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/extension/package.json ./apps/extension/package.json

RUN bun install \
    --frozen-lockfile \
    --production \
    --filter @booth-plus/backend

FROM oven/bun:1.3.1-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /workspace

COPY --from=dependencies --chown=bun:bun /workspace /workspace
COPY --chown=bun:bun apps/backend/src ./apps/backend/src
COPY --chown=bun:bun apps/backend/scripts ./apps/backend/scripts
COPY --chown=bun:bun apps/backend/migrations ./apps/backend/migrations

WORKDIR /workspace/apps/backend

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3000/api/health'); process.exit(response.ok ? 0 : 1)"]

STOPSIGNAL SIGTERM

CMD ["bun", "run", "start"]
