#!/usr/bin/env bash
set -Eeuo pipefail

usage="Usage: deploy.sh <immutable-backend-image> <immutable-admin-image> <admin-domain> <admin-redirect-url>"
backend_image_ref="${1:?$usage}"
admin_image_ref="${2:?$usage}"
admin_domain="${3:?$usage}"
admin_redirect_url="${4:?$usage}"
deploy_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$deploy_root"

[[ "$backend_image_ref" == ghcr.io/ribekim/booth-plus-backend@sha256:* ]]
[[ "$admin_image_ref" == ghcr.io/ribekim/booth-plus-admin@sha256:* ]]
[[ "$admin_domain" =~ ^[A-Za-z0-9.-]+$ ]]
[[ "$admin_redirect_url" =~ ^https://[A-Za-z0-9.-]+/oauth/callback$ ]]

export BACKEND_IMAGE="$backend_image_ref"
export ADMIN_IMAGE="$admin_image_ref"
export ADMIN_DOMAIN="$admin_domain"
export ADMIN_REDIRECT_URL="$admin_redirect_url"
compose=(docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml)

diagnostics() {
  status=$?
  echo "Deployment failed with status $status" >&2
  "${compose[@]}" ps -a >&2 || true
  "${compose[@]}" logs --tail=150 postgres admin backend caddy >&2 || true
  exit "$status"
}
trap diagnostics ERR

test -s deploy/oci/.env
"${compose[@]}" config --quiet

# Prepare every immutable/runtime image before changing services.
"${compose[@]}" pull admin backend postgres caddy

# Caddy can obtain/renew TLS while the database and application are prepared.
"${compose[@]}" up -d --no-deps --no-build --pull missing caddy

# Start the private database and wait for its Compose health check.
"${compose[@]}" up -d --no-build --pull missing --wait postgres

# Schema changes must succeed before the API image is replaced.
"${compose[@]}" --profile migrate run --rm --no-deps --pull never migrate

"${compose[@]}" up -d --no-build --pull missing --wait admin backend caddy

backend_id="$("${compose[@]}" ps -q backend)"
admin_id="$("${compose[@]}" ps -q admin)"
test -n "$backend_id"
test -n "$admin_id"
test "$(docker inspect --format '{{.State.Health.Status}}' "$backend_id")" = "healthy"
test "$(docker inspect --format '{{.State.Health.Status}}' "$admin_id")" = "healthy"

"${compose[@]}" ps
trap - ERR
