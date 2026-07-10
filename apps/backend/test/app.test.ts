import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { isOriginAllowed } from "../src/cors.js";

test("GET /api/health reports that the backend is ready", async (context) => {
  const app = await buildApp({
    corsOrigins: [],
    logger: false,
    logLevel: "silent",
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "@booth-plus/backend",
  });
});

test("unknown routes return Fastify's JSON 404 response", async (context) => {
  const app = await buildApp({
    corsOrigins: [],
    logger: false,
    logLevel: "silent",
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/unknown",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "Not Found");
});

test("CORS preflight supports the extension's write methods", async (context) => {
  const app = await buildApp({
    corsOrigins: ["https://booth.pm", "https://*.booth.pm"],
    logger: false,
    logLevel: "silent",
  });
  context.after(() => app.close());

  for (const method of ["PUT", "DELETE"]) {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/comment/product-id",
      headers: {
        origin: "https://creator.booth.pm",
        "access-control-request-headers": "authorization,content-type",
        "access-control-request-method": method,
      },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "https://creator.booth.pm");
    assert.match(response.headers["access-control-allow-methods"] ?? "", new RegExp(`\\b${method}\\b`));
    assert.match(response.headers["access-control-allow-headers"] ?? "", /Authorization/i);
    assert.match(response.headers["access-control-allow-headers"] ?? "", /Content-Type/i);
  }
});

test("origin matching accepts BOOTH subdomains without accepting lookalike domains", () => {
  const allowedOrigins = ["https://booth.pm", "https://*.booth.pm"];

  assert.equal(isOriginAllowed("https://booth.pm", allowedOrigins), true);
  assert.equal(isOriginAllowed("https://creator.booth.pm", allowedOrigins), true);
  assert.equal(isOriginAllowed("https://nested.creator.booth.pm", allowedOrigins), true);
  assert.equal(isOriginAllowed("http://creator.booth.pm", allowedOrigins), false);
  assert.equal(isOriginAllowed("https://evilbooth.pm", allowedOrigins), false);
  assert.equal(isOriginAllowed("https://booth.pm.evil.example", allowedOrigins), false);
});
