import { Hono } from "hono";
import { cors } from "hono/cors";

import { isOriginAllowed, parseCorsOrigins } from "./cors";
import { hasRequiredDatabaseSchema } from "./database";

type WorkerEnvironment = {
  Bindings: CloudflareBindings;
};

export const app = new Hono<WorkerEnvironment>();

app.use("/api/*", async (context, next) => {
  const allowedOrigins = parseCorsOrigins(context.env.CORS_ORIGINS);
  const corsMiddleware = cors({
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86_400,
    origin: (origin) => (isOriginAllowed(origin, allowedOrigins) ? origin : null),
  });

  return corsMiddleware(context, next);
});

app.get("/api/health", (context) =>
  context.json({
    status: "ok",
    service: "@booth-plus/backend",
    runtime: "cloudflare-workers",
  }),
);

app.get("/api/health/storage", async (context) => {
  try {
    const isReady = await hasRequiredDatabaseSchema(context.env.DB);

    return context.json(
      {
        status: isReady ? "ok" : "unavailable",
        service: "@booth-plus/backend",
        storage: "cloudflare-d1",
      },
      isReady ? 200 : 503,
    );
  } catch (error) {
    console.error("D1 readiness check failed", error);

    return context.json(
      {
        status: "unavailable",
        service: "@booth-plus/backend",
        storage: "cloudflare-d1",
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
