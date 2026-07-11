import { fileURLToPath } from "node:url";

import { runner } from "node-pg-migrate";

import { loadConfig } from "../src/config";
import { createPostgresConfig } from "../src/database";

const config = loadConfig();
const databaseUrl = await createPostgresConfig(
  config.database,
  config.database.migrationTimeoutMs,
);
const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

await runner({
  databaseUrl,
  dir: migrationsDirectory,
  direction: "up",
  schema: "public",
  migrationsSchema: "public",
  migrationsTable: "app_migrations",
  checkOrder: true,
  singleTransaction: true,
  verbose: true,
});
