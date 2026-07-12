# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.1-alpine AS build
WORKDIR /workspace
COPY package.json bun.lock bunfig.toml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/extension/package.json apps/extension/package.json
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/admin apps/admin
RUN bun run --filter @booth-plus/admin build

FROM nginxinc/nginx-unprivileged:1.29.5-alpine
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/admin/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
