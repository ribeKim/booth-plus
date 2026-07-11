import { readFileSync } from "node:fs";

import { parseCorsOrigins } from "./cors";

export type DatabaseSslMode = "disable" | "require" | "verify-full";

export type DatabaseConfig = {
  url: string;
  sslMode: DatabaseSslMode;
  sslCaFile?: string;
  poolMax: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  migrationTimeoutMs: number;
  maxLifetimeSeconds: number;
};

export type BackendConfig = {
  hostname: string;
  port: number;
  corsOrigins: string[];
  shutdownGraceMs: number;
  database: DatabaseConfig;
};

type Environment = Record<string, string | undefined>;
type ReadTextFile = (path: string) => string;

const defaultReadTextFile: ReadTextFile = (path) => readFileSync(path, "utf8");

const parseInteger = (
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }

  return parsed;
};

const parseDatabaseUrl = (value: string | undefined): string => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error("DATABASE_URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedValue);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme");
  }

  const tlsParameters = new Set([
    "ssl",
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "sslnegotiation",
  ]);
  const conflictingTlsParameters = [...new Set(parsed.searchParams.keys())].filter((parameter) =>
    tlsParameters.has(parameter.toLowerCase()),
  );
  if (conflictingTlsParameters.length > 0) {
    throw new Error(
      `Configure PostgreSQL TLS with DATABASE_SSL_MODE and DATABASE_SSL_CA_FILE, not DATABASE_URL query parameters: ${conflictingTlsParameters.join(", ")}`,
    );
  }

  return normalizedValue;
};

const resolveDatabaseUrl = (environment: Environment, readTextFile: ReadTextFile): string => {
  const inlineValue = environment.DATABASE_URL?.trim();
  const filePath = environment.DATABASE_URL_FILE?.trim();

  if (inlineValue && filePath) {
    throw new Error("Set only one of DATABASE_URL or DATABASE_URL_FILE");
  }

  if (!filePath) {
    return parseDatabaseUrl(inlineValue);
  }

  let fileValue: string;
  try {
    fileValue = readTextFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read DATABASE_URL_FILE: ${message}`);
  }

  return parseDatabaseUrl(fileValue);
};

const parseSslMode = (value: string | undefined): DatabaseSslMode => {
  const mode = value?.trim() || "verify-full";
  if (mode === "disable" || mode === "require" || mode === "verify-full") {
    return mode;
  }

  throw new Error("DATABASE_SSL_MODE must be disable, require, or verify-full");
};

export const loadConfig = (
  environment: Environment = process.env,
  readTextFile: ReadTextFile = defaultReadTextFile,
): BackendConfig => {
  const sslMode = parseSslMode(environment.DATABASE_SSL_MODE);
  const sslCaFile = environment.DATABASE_SSL_CA_FILE?.trim() || undefined;

  if (sslMode === "verify-full" && !sslCaFile) {
    throw new Error("DATABASE_SSL_CA_FILE is required when DATABASE_SSL_MODE is verify-full");
  }

  return {
    hostname: environment.HOST?.trim() || "0.0.0.0",
    port: parseInteger("PORT", environment.PORT, 3000, 1, 65_535),
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS),
    shutdownGraceMs: parseInteger(
      "SHUTDOWN_GRACE_MS",
      environment.SHUTDOWN_GRACE_MS,
      25_000,
      1_000,
      120_000,
    ),
    database: {
      url: resolveDatabaseUrl(environment, readTextFile),
      sslMode,
      ...(sslCaFile ? { sslCaFile } : {}),
      poolMax: parseInteger("DATABASE_POOL_MAX", environment.DATABASE_POOL_MAX, 10, 1, 100),
      connectTimeoutMs: parseInteger(
        "DATABASE_CONNECT_TIMEOUT_MS",
        environment.DATABASE_CONNECT_TIMEOUT_MS,
        5_000,
        100,
        60_000,
      ),
      idleTimeoutMs: parseInteger(
        "DATABASE_IDLE_TIMEOUT_MS",
        environment.DATABASE_IDLE_TIMEOUT_MS,
        30_000,
        1_000,
        600_000,
      ),
      statementTimeoutMs: parseInteger(
        "DATABASE_STATEMENT_TIMEOUT_MS",
        environment.DATABASE_STATEMENT_TIMEOUT_MS,
        5_000,
        100,
        120_000,
      ),
      migrationTimeoutMs: parseInteger(
        "DATABASE_MIGRATION_TIMEOUT_MS",
        environment.DATABASE_MIGRATION_TIMEOUT_MS,
        900_000,
        1_000,
        3_600_000,
      ),
      maxLifetimeSeconds: parseInteger(
        "DATABASE_MAX_LIFETIME_SECONDS",
        environment.DATABASE_MAX_LIFETIME_SECONDS,
        300,
        30,
        86_400,
      ),
    },
  };
};
