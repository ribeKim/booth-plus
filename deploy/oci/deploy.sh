#!/usr/bin/env bash
set -Eeuo pipefail

image_ref="${1:?Usage: deploy.sh <immutable-backend-image>}"
deploy_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$deploy_root"

[[ "$image_ref" == ghcr.io/ribekim/booth-plus-backend@sha256:* ]]

export BACKEND_IMAGE="$image_ref"
compose=(docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml)

diagnostics() {
  status=$?
  echo "Deployment failed with status $status" >&2
  "${compose[@]}" ps -a >&2 || true
  "${compose[@]}" logs --tail=150 postgres backend caddy >&2 || true
  exit "$status"
}
trap diagnostics ERR

test -s deploy/oci/.env
"${compose[@]}" config --quiet

# Prepare every immutable/runtime image before changing services.
"${compose[@]}" pull backend postgres caddy

# Caddy can obtain/renew TLS while the database and application are prepared.
"${compose[@]}" up -d --no-deps --no-build --pull missing caddy

# Start the private database and wait for its Compose health check.
"${compose[@]}" up -d --no-build --pull missing --wait postgres

# Schema changes must succeed before the API image is replaced.
"${compose[@]}" --profile migrate run --rm --no-deps --pull never migrate

"${compose[@]}" up -d --no-build --pull missing --wait backend caddy

backend_id="$("${compose[@]}" ps -q backend)"
test -n "$backend_id"
test "$(docker inspect --format '{{.State.Health.Status}}' "$backend_id")" = "healthy"

"${compose[@]}" ps
trap - ERR
