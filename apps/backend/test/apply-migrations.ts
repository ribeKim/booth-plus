import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";

const testEnvironment = env as CloudflareBindings & {
  TEST_MIGRATIONS: D1Migration[];
};

await applyD1Migrations(testEnvironment.DB, testEnvironment.TEST_MIGRATIONS);
