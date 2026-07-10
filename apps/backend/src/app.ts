import { Hono } from "hono";
import { cors } from "hono/cors";

import { isOriginAllowed, parseCorsOrigins } from "./cors";

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
