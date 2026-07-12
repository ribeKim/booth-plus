# OCI single-VM Docker deployment

The production stack runs on one OCI VM with Docker Compose:

- Caddy on public TCP 80/443 and UDP 443
- FastAPI on the private Compose network
- PostgreSQL 17 on the private Compose network
- Alembic as a one-shot migration container

PostgreSQL port 5432 is not published. This is not a high-availability design: the VM and its boot volume are single points of failure. Docker restart policies recover processes after a reboot, but VM or disk failure requires restoration from backup.

## VM prerequisites

- Docker Engine and Docker Compose plugin
- Bun 1.3.1 or newer for repository deployment scripts
- Tailscale with Tailscale SSH enabled
- DNS for `booth-plus.ribe.moe` pointing to the VM
- OCI NSG and host firewall allowing public TCP 80/443 and UDP 443
- Enough persistent boot/block-volume capacity for PostgreSQL and backups

Do not expose TCP 3000 or 5432 publicly. Public TCP 22 can be closed after Tailscale SSH is verified.

## First-time configuration

Create the deployment directory as the dedicated deployment user:

```sh
sudo useradd --create-home --shell /bin/bash deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 0750 /opt/booth-plus/dev
sudo tailscale set --ssh
sudo tailscale set --advertise-tags=tag:booth-plus-dev
```

Create the ignored deployment environment file from the tracked example:

```sh
cd /opt/booth-plus/dev
cp deploy/oci/.env.example deploy/oci/.env
chmod 600 deploy/oci/.env
```

Set `ACME_EMAIL`, `CORS_ORIGINS`, and the other non-secret values. CI exports the immutable `BACKEND_IMAGE` digest during deployment, so the example image value is only a local fallback.

Generate one strong database password outside the repository:

```sh
sudo install -d -o root -g root -m 0700 /etc/booth-plus/secrets
openssl rand -base64 48 | sudo tee /etc/booth-plus/secrets/postgres-password >/dev/null
sudo chown root:root /etc/booth-plus/secrets/postgres-password
sudo chmod 0444 /etc/booth-plus/secrets/postgres-password
```

The file must contain only the password and a trailing newline. `deploy/oci/.env` must contain:

```dotenv
POSTGRES_PASSWORD_HOST_FILE=/etc/booth-plus/secrets/postgres-password
```

Docker mounts this file read-only into PostgreSQL, FastAPI, and the one-shot migrator. The parent directory prevents ordinary host users from traversing to it. Do not commit the password or put it directly in `.env`.

The password initializes PostgreSQL only when `postgres-data` is empty. Replacing the file later does not automatically change the password inside an existing database.

Validate configuration without printing secret contents:

```sh
docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml config --quiet
```

## Keyless GitHub deployment

Paste [`tailscale-policy.hujson`](./tailscale-policy.hujson) into **Tailscale Admin Console → Access controls**. For GitHub Environment `dev`, set:

```text
TS_OAUTH_CLIENT_ID=<federated identity client ID>
TS_AUDIENCE=<federated identity audience>
TS_TAG=tag:github-actions-dev
OCI_TAILSCALE_HOST=<VM Tailscale 100.x address>
OCI_SSH_USER=deploy
OCI_DEPLOY_PATH=/opt/booth-plus/dev
APP_HEALTH_URL=https://booth-plus.ribe.moe/api/health/storage
```

The federated identity needs only the `auth_keys` scope and `tag:github-actions-dev`. Constrain its subject to `repo:ribeKim/booth-plus:environment:dev`, the `dev` ref, and this repository's deployment workflow.

The Action publishes an immutable multi-architecture image, joins the tailnet as an ephemeral tagged node, copies tracked deployment files over Tailscale SSH, starts PostgreSQL, applies Alembic migrations, replaces FastAPI/Caddy only after migration success, and checks the public health URL. SSH uses no private key; its host key is accepted into a runner-temporary known-hosts file.

If GHCR is private, authenticate the VM once with a read-only `read:packages` token. Otherwise make the container package public.

The Compose project has a fixed name and owns public ports 80/443. Dev and prod cannot run side by side with this file on the same VM.

## Deployment order

For an image published by CI:

```sh
bun run deploy:pull
bun run deploy:migrate
bun run deploy:backend
```

`deploy:migrate` starts PostgreSQL and waits for its health check before running `alembic upgrade head`. If migration fails, the script exits and the new backend is not started. Runtime readiness checks PostgreSQL writability, the Alembic head revision, and all required tables.

For a manual on-VM build, replace `deploy:pull` with `bun run deploy:build`.

## Operations and backup

Inspect status and logs:

```sh
docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml ps
docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml logs --tail=200 postgres backend caddy
```

Create a compressed logical backup outside the Docker volume:

```sh
mkdir -p /opt/booth-plus/backups
docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml \
  exec -T postgres pg_dump -U booth_plus -d booth_plus -Fc \
  > "/opt/booth-plus/backups/booth-plus-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Copy backups to storage outside this VM, such as an OCI Object Storage bucket. A backup kept only on the same boot volume does not protect against VM or volume loss. Regularly test restoration into a separate database. PostgreSQL failover is not available while the database and API share this single VM.

Monitor disk capacity, container health, certificate renewal, backup age, and `/api/health/storage`.
