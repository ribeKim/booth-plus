import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

test("Worker default export handles health requests in workerd", async () => {
  const response = await exports.default.fetch("https://worker.test/api/health");

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    status: "ok",
    service: "@booth-plus/backend",
    runtime: "cloudflare-workers",
  });
});
