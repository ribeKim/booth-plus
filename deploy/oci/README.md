# OCI single-VM deployment

This deployment runs the backend and Caddy on one OCI Compute VM and connects them to an external **OCI Database with PostgreSQL two-node DB system**. PostgreSQL is deliberately not part of this Compose project.

The two database nodes provide database-layer failover. The application VM is still a **single point of failure**: Docker restart policies recover a process or a reboot, but they cannot keep the service online when that VM, its availability domain, or its network path is unavailable. True application high availability would require at least two application instances behind an OCI Load Balancer, which this layout does not provide.

## Prerequisites

- An OCI Database with PostgreSQL two-node DB system and its service-provided primary FQDN
- Separate database credentials: a least-privilege application role and a DDL-capable migration role
- The CA certificate chain required by the OCI PostgreSQL endpoint
- One OCI Compute VM with Docker Engine and the Docker Compose plugin
- Bun 1.3.1 or newer on the VM to run the repository deployment scripts
- A DNS `A`/`AAAA` record for the API hostname pointing to the VM
- Inbound TCP 80 and 443, plus UDP 443, to the VM; restrict SSH to trusted sources
- PostgreSQL TCP 5432 allowed only from the application VM's NSG or private subnet

Keep the database on a private endpoint when possible. The hostname in `DATABASE_URL` must be the exact primary FQDN covered by the server certificate. An IP address or a custom alias fails `verify-full` hostname validation.

## Configure the VM

From the repository root, create the deployment environment file:

```sh
cp deploy/oci/.env.example deploy/oci/.env
chmod 600 deploy/oci/.env
```

Fill in every value. Keep `APP_DOMAIN=api.example.com` (or another new hostname) while this backend is only a foundation. The extension still calls `/auth`, `/user`, `/product`, and `/comment`; do **not** point the existing `vbt.kamyu.me` API hostname at this deployment until those routes are implemented and cutover-tested.

The `.env` file contains paths, not database passwords. Create two root-owned URL files outside the repository:

```sh
sudo install -d -o root -g root -m 0700 /etc/booth-plus/secrets
sudoedit /etc/booth-plus/secrets/database-url
sudoedit /etc/booth-plus/secrets/migration-database-url
sudo chmod 0444 \
  /etc/booth-plus/secrets/database-url \
  /etc/booth-plus/secrets/migration-database-url
```

Each file must contain exactly one `postgresql://` URL with the OCI Database with PostgreSQL primary FQDN. Percent-encode reserved characters in its username and password, and omit `ssl`, `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, and `sslnegotiation` URL parameters because the container configures verified TLS separately. The files are read-only but world-readable so the image's non-root `bun` user can read file-backed Compose secrets; the parent directory remains root-owned mode `0700`, preventing non-root host users from traversing to them. `DATABASE_URL_HOST_FILE` must reference the application-role URL, and `MIGRATION_DATABASE_URL_HOST_FILE` must reference the separate migration-role URL. The backend receives only `/run/secrets/database-url`; only the one-shot migrator receives `/run/secrets/migration-database-url`. Do not grant schema ownership or DDL privileges to the application role.

Bootstrap the roles from an administrator `psql` session connected to the application database. The values below are `psql` variables; replace the database name and password placeholders only in a private administrator session, never in a tracked file:

```sql
\set ON_ERROR_STOP on
\set database_name booth_plus
\set migration_role booth_plus_migration
\set app_role booth_plus_app

CREATE ROLE :"migration_role"
  LOGIN PASSWORD 'REPLACE_WITH_MIGRATION_PASSWORD';
CREATE ROLE :"app_role"
  LOGIN PASSWORD 'REPLACE_WITH_APPLICATION_PASSWORD';

GRANT CONNECT ON DATABASE :"database_name" TO :"migration_role", :"app_role";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"migration_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
```

Next, connect as the migration role and establish grants for objects it owns. Run this before the first migration so default privileges cover every new table and sequence:

```sql
\set ON_ERROR_STOP on
\set app_role booth_plus_app

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
```

The `GRANT ... ON ALL` statements are idempotent and also reconcile a database where application tables already exist. After the first migration creates `public.app_migrations`, keep the readiness lookup but remove unnecessary mutation privileges from that migration ledger:

```sql
\set ON_ERROR_STOP on
\set app_role booth_plus_app

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.app_migrations FROM :"app_role";
GRANT SELECT ON TABLE public.app_migrations TO :"app_role";
```

Run the last block as the migration role. Migrations and schema objects remain owned by that role; the long-running application can connect, use `public`, read its migration readiness row, perform application CRUD, and use generated-key sequences, but cannot perform DDL.

Install the OCI PostgreSQL CA chain outside the repository:

```sh
sudo install -d -m 0755 /etc/booth-plus
sudo install -o root -g root -m 0444 /path/to/oci-postgresql-ca.pem \
  /etc/booth-plus/oci-postgresql-ca.pem
```

Set `DATABASE_SSL_CA_HOST_FILE` to that absolute host path. Compose mounts it read-only at `/run/secrets/oci-postgresql-ca.pem`; the backend receives `DATABASE_SSL_MODE=verify-full` and `DATABASE_SSL_CA_FILE` automatically. On SELinux-enforcing Oracle Linux, label the deployment files before starting containers:

```sh
sudo chcon -Rt container_file_t /etc/booth-plus
sudo chcon -t container_file_t deploy/oci/Caddyfile
```

The shared CA bind mount uses Compose's `ro,z` relabel option because the backend and migrator may overlap; the Caddyfile, used by one container, uses private `ro,Z`. Do not add private keys, database passwords, secret files, or `.env` files to the image or repository. `.dockerignore` excludes `deploy/oci/secrets/` as an additional guard for local experiments.

Validate the Compose model without printing the resolved secret values:

```sh
docker compose \
  --env-file deploy/oci/.env \
  -f deploy/oci/compose.yaml \
  config --quiet
```

## First deployment

Prepare one backend image, run the one-shot migration from that image, and then start the long-running services from the same image reference. For an on-VM build:

```sh
bun run deploy:build
bun run deploy:migrate
# On the first deployment, run the app_migrations privilege block above here.
bun run deploy:backend
```

For an image published by CI, set `BACKEND_IMAGE` to its immutable tag or digest and replace `bun run deploy:build` with `bun run deploy:pull`. Do not run both for one release. `deploy:migrate` disables dependency startup, pulling, and building; `deploy:backend` disables building and only pulls a missing image such as Caddy. Consequently, migration and runtime use the exact `BACKEND_IMAGE` prepared in the first step.

The migration container runs `bun run db:migrate` and exits. It is behind the `migrate` profile so a normal `up -d` cannot rerun schema changes accidentally. Caddy is the only public service; the backend is reachable only on the private Compose network. Caddy runs with a read-only root filesystem, no-new-privileges, all capabilities dropped except `NET_BIND_SERVICE`, and writable state limited to `/data`, `/config`, and a temporary `/tmp`.

Caddy obtains a public TLS certificate for `APP_DOMAIN`, so DNS and ports 80/443 must be ready before it starts. Its persistent volumes retain ACME state across container replacements.

## Updates

Use an immutable registry tag or digest in `BACKEND_IMAGE` for reproducible production releases. Prepare the release once, apply migrations, and then recreate the services without a second build:

```sh
bun run deploy:pull
bun run deploy:migrate
bun run deploy:backend
```

If `BACKEND_IMAGE` is built on the VM instead of pulled from a registry, replace `bun run deploy:pull` with `bun run deploy:build`. The migration must succeed before the backend is recreated. A failed migration is a stopped deployment, not a reason to start the new application image anyway.

Check status and non-secret logs with:

```sh
docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml ps
docker compose --env-file deploy/oci/.env -f deploy/oci/compose.yaml logs --tail=200 backend caddy
```

The backend health check uses `/api/health/storage`, so it reports unhealthy when PostgreSQL or required migrations are unavailable. During a managed database failover, existing connections can drop; the application must reconnect through the same OCI primary FQDN. Test this behavior and the service's backup/restore procedure before production use.

## Availability boundary

This design improves the database failure domain only:

- **Database node failure:** handled by the OCI two-node database service; clients reconnect to the primary FQDN.
- **Backend or Caddy process failure:** Docker restarts the failed container.
- **Application VM, availability-domain, or VM network failure:** the API is offline until this single VM is restored or replaced.
- **Bad deployment, destructive migration, or data corruption:** failover does not help; keep tested backups and a recovery runbook.

If application downtime later becomes unacceptable, add a second VM in a separate failure domain and an OCI Load Balancer. Until then, monitor the VM, database endpoint, certificate renewal, disk capacity, and `/api/health/storage`, and document the accepted single-VM recovery time.
