import { readFile } from "node:fs/promises";

import { Pool, type PoolConfig, type QueryResultRow } from "pg";

import type { DatabaseConfig } from "./config";

const requiredMigrationName = "0001_initial";

const readinessQuery = `
  SELECT
    NOT pg_is_in_recovery()
    AND current_setting('transaction_read_only') = 'off'
    AND EXISTS (
      SELECT 1 FROM public.app_migrations WHERE name = $1
    )
    AND to_regclass('public.users') IS NOT NULL
    AND to_regclass('public.oauth_accounts') IS NOT NULL
    AND to_regclass('public.auth_sessions') IS NOT NULL
    AND to_regclass('public.shops') IS NOT NULL
    AND to_regclass('public.products') IS NOT NULL
    AND to_regclass('public.product_thumbnails') IS NOT NULL
    AND to_regclass('public.comments') IS NOT NULL
    AND to_regclass('public.comment_votes') IS NOT NULL
    AS is_ready
`;

export type Database = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<Row[]>;
  isReady(): Promise<boolean>;
  close(): Promise<void>;
};

export const createPostgresConfig = async (
  config: DatabaseConfig,
  statementTimeoutMs = config.statementTimeoutMs,
): Promise<PoolConfig> => {
  const ssl =
    config.sslMode === "disable"
      ? false
      : config.sslMode === "require"
        ? { rejectUnauthorized: false }
        : {
            ca: await readFile(config.sslCaFile as string, "utf8"),
            rejectUnauthorized: true,
          };

  return {
    connectionString: config.url,
    ssl,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    maxLifetimeSeconds: config.maxLifetimeSeconds,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs + 1_000,
    application_name: "booth-plus-backend",
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };
};

export const createDatabase = async (config: DatabaseConfig): Promise<Database> => {
  const pool = new Pool(await createPostgresConfig(config));

  pool.on("error", (error) => {
    console.error("PostgreSQL idle connection failed", error);
  });

  return {
    async query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<Row[]> {
      const result = await pool.query<Row>(text, [...values]);
      return result.rows;
    },
    async isReady(): Promise<boolean> {
      const result = await pool.query<{ is_ready: boolean }>(readinessQuery, [
        requiredMigrationName,
      ]);
      return result.rows[0]?.is_ready === true;
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
};
