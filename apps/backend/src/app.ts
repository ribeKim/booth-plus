import { Hono } from "hono";
import { cors } from "hono/cors";

import { isOriginAllowed } from "./cors";
import type { Database } from "./database";

export type LifecycleState = {
  shuttingDown: boolean;
};

type AppDependencies = {
  corsOrigins: readonly string[];
  database: Pick<Database, "isReady">;
  lifecycle?: LifecycleState;
};

export const createApp = ({
  corsOrigins,
  database,
  lifecycle = { shuttingDown: false },
}: AppDependencies): Hono => {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      maxAge: 86_400,
      origin: (origin) => (isOriginAllowed(origin, corsOrigins) ? origin : null),
    }),
  );

  app.get("/api/health", (context) =>
    context.json({
      status: "ok",
      service: "@booth-plus/backend",
      runtime: "bun",
    }),
  );

  app.get("/api/health/storage", async (context) => {
    if (lifecycle.shuttingDown) {
      return context.json(
        {
          status: "unavailable",
          service: "@booth-plus/backend",
          storage: "postgresql",
        },
        503,
      );
    }

    try {
      const isReady = await database.isReady();

      return context.json(
        {
          status: isReady ? "ok" : "unavailable",
          service: "@booth-plus/backend",
          storage: "postgresql",
        },
        isReady ? 200 : 503,
      );
    } catch (error) {
      console.error("PostgreSQL readiness check failed", error);

      return context.json(
        {
          status: "unavailable",
          service: "@booth-plus/backend",
          storage: "postgresql",
        },
        503,
      );
    }
  });

  app.notFound((context) =>
    context.json(
      {
        statusCode: 404,
        error: "Not Found",
        message: "Not Found",
      },
      404,
    ),
  );

  return app;
};
