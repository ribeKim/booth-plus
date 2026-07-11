import { describe, expect, test } from "vitest";

import { loadConfig } from "../src/config";

const localEnvironment = {
  DATABASE_URL: "postgresql://booth_plus:password@127.0.0.1:5432/booth_plus",
  DATABASE_SSL_MODE: "disable",
};

describe("backend configuration", () => {
  test("loads safe local defaults", () => {
    expect(loadConfig(localEnvironment)).toMatchObject({
      hostname: "0.0.0.0",
      port: 3000,
      corsOrigins: [],
      shutdownGraceMs: 25_000,
      database: {
        sslMode: "disable",
        poolMax: 10,
        connectTimeoutMs: 5_000,
        idleTimeoutMs: 30_000,
        statementTimeoutMs: 5_000,
        migrationTimeoutMs: 900_000,
        maxLifetimeSeconds: 300,
      },
    });
  });

  test("requires a PostgreSQL URL", () => {
    expect(() => loadConfig({ DATABASE_SSL_MODE: "disable" })).toThrow(
      "DATABASE_URL is required",
    );
    expect(() =>
      loadConfig({ DATABASE_URL: "https://database.example", DATABASE_SSL_MODE: "disable" }),
    ).toThrow("postgres or postgresql scheme");
  });

  test("requires a CA certificate for verify-full", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: localEnvironment.DATABASE_URL,
        DATABASE_SSL_MODE: "verify-full",
      }),
    ).toThrow("DATABASE_SSL_CA_FILE is required");
  });

  test("keeps TLS settings out of the connection URL", () => {
    for (const parameter of [
      "sslmode=disable",
      "ssl=no-verify",
      "sslnegotiation=direct",
      "sslrootcert=/tmp/ca.pem",
    ]) {
      expect(() =>
        loadConfig({
          DATABASE_URL: `${localEnvironment.DATABASE_URL}?${parameter}`,
          DATABASE_SSL_MODE: "disable",
        }),
      ).toThrow("not DATABASE_URL query parameters");
    }
  });

  test("loads the database URL from a file secret", () => {
    const config = loadConfig(
      {
        DATABASE_URL_FILE: "/run/secrets/database_url",
        DATABASE_SSL_MODE: "disable",
      },
      (path) => {
        expect(path).toBe("/run/secrets/database_url");
        return `${localEnvironment.DATABASE_URL}\n`;
      },
    );

    expect(config.database.url).toBe(localEnvironment.DATABASE_URL);
    expect(() =>
      loadConfig(
        {
          ...localEnvironment,
          DATABASE_URL_FILE: "/run/secrets/database_url",
        },
        () => localEnvironment.DATABASE_URL,
      ),
    ).toThrow("only one of DATABASE_URL or DATABASE_URL_FILE");
  });

  test("rejects invalid numeric settings", () => {
    expect(() => loadConfig({ ...localEnvironment, DATABASE_POOL_MAX: "0" })).toThrow(
      "DATABASE_POOL_MAX",
    );
    expect(() => loadConfig({ ...localEnvironment, PORT: "70000" })).toThrow("PORT");
  });
});
