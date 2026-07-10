import { describe, expect, test } from "vitest";

import { app } from "../src/app";
import { isOriginAllowed, parseCorsOrigins } from "../src/cors";

const bindings: CloudflareBindings = {
  CORS_ORIGINS:
    "https://booth.pm,https://*.booth.pm,chrome-extension://hafbafjoecfjdlhjilpakabocglkaegj",
};

const request = (path: string, init?: RequestInit) =>
  app.request(`https://worker.test${path}`, init, bindings);

describe("BoothPlus Worker", () => {
  test("GET /api/health reports the Worker runtime", async () => {
    const response = await request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "@booth-plus/backend",
      runtime: "cloudflare-workers",
    });
  });

  test("unknown routes return a JSON 404 response", async () => {
    const response = await request("/api/unknown");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      statusCode: 404,
      error: "Not Found",
      message: "Not Found",
    });
  });

  test.each(["PUT", "DELETE"])("CORS preflight supports %s", async (method) => {
    const response = await request("/api/comment/product-id", {
      method: "OPTIONS",
      headers: {
        Origin: "https://creator.booth.pm",
        "Access-Control-Request-Headers": "authorization,content-type",
        "Access-Control-Request-Method": method,
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://creator.booth.pm");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(method);
    expect(response.headers.get("Access-Control-Allow-Headers")).toMatch(/Authorization/i);
    expect(response.headers.get("Access-Control-Allow-Headers")).toMatch(/Content-Type/i);
  });

  test("CORS does not allow lookalike domains", async () => {
    const response = await request("/api/health", {
      headers: {
        Origin: "https://booth.pm.evil.example",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

test("origin helpers parse bindings and safely match BOOTH subdomains", () => {
  const allowedOrigins = parseCorsOrigins(
    "https://booth.pm, https://*.booth.pm, chrome-extension://extension-id",
  );

  expect(isOriginAllowed("https://booth.pm", allowedOrigins)).toBe(true);
  expect(isOriginAllowed("https://creator.booth.pm", allowedOrigins)).toBe(true);
  expect(isOriginAllowed("https://nested.creator.booth.pm", allowedOrigins)).toBe(true);
  expect(isOriginAllowed("chrome-extension://extension-id", allowedOrigins)).toBe(true);
  expect(isOriginAllowed("http://creator.booth.pm", allowedOrigins)).toBe(false);
  expect(isOriginAllowed("https://evilbooth.pm", allowedOrigins)).toBe(false);
  expect(isOriginAllowed("https://booth.pm.evil.example", allowedOrigins)).toBe(false);
});
