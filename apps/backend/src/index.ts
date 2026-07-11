import { createApp, type LifecycleState } from "./app";
import { loadConfig } from "./config";
import { createDatabase } from "./database";

const config = loadConfig();
const database = await createDatabase(config.database);
const lifecycle: LifecycleState = { shuttingDown: false };
const app = createApp({
  corsOrigins: config.corsOrigins,
  database,
  lifecycle,
});

const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  idleTimeout: 30,
  fetch: app.fetch,
  error(error) {
    console.error("Unhandled HTTP server error", error);
    return Response.json(
      {
        statusCode: 500,
        error: "Internal Server Error",
        message: "Internal Server Error",
      },
      { status: 500 },
    );
  },
});

console.info(`BoothPlus backend listening on ${server.url}`);

let shutdownPromise: Promise<void> | undefined;

const shutdown = (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    lifecycle.shuttingDown = true;
    console.info(`Received ${signal}; shutting down`);

    const forceTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out; closing active connections");
      void server.stop(true);
    }, config.shutdownGraceMs);

    try {
      await server.stop();
    } finally {
      clearTimeout(forceTimer);
      await database.close();
    }
  })();

  return shutdownPromise;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
