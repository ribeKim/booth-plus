import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import type { BackendConfig } from "./config.js";
import { isOriginAllowed } from "./cors.js";

export type BuildAppOptions = Pick<BackendConfig, "corsOrigins" | "logLevel"> & {
  logger?: boolean;
};

export const buildApp = async ({
  corsOrigins,
  logLevel,
  logger = true,
}: BuildAppOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: logger ? { level: logLevel } : false,
  });
  await app.register(cors, {
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true,
    maxAge: 86_400,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin, corsOrigins)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "@booth-plus/backend",
  }));

  return app;
};
