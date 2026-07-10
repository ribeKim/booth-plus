import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("Worker default export handles health requests in workerd", async () => {
  const response = await SELF.fetch("https://worker.test/api/health");

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    status: "ok",
    service: "@booth-plus/backend",
    runtime: "cloudflare-workers",
  });
});

test("D1 migrations make the storage health check ready", async () => {
  const response = await SELF.fetch("https://worker.test/api/health/storage");

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    status: "ok",
    service: "@booth-plus/backend",
    storage: "cloudflare-d1",
  });
});

test("storage health requires its D1 migration and tolerates newer migrations", async () => {
  const requiredMigration = await env.DB.prepare(
    "SELECT id, name FROM d1_migrations WHERE name = ?",
  )
    .bind("0001_initial.sql")
    .first<{ id: number; name: string }>();
  const migrationState = await env.DB.prepare(
    "SELECT COALESCE(MAX(id), 0) + 1 AS futureMigrationId FROM d1_migrations",
  ).first<{ futureMigrationId: number }>();

  expect(requiredMigration).not.toBeNull();
  expect(migrationState).not.toBeNull();
  if (!requiredMigration || !migrationState) {
    throw new Error("Expected the required D1 migration state");
  }

  const response = await (async () => {
    const futureMigrationId = migrationState.futureMigrationId;
    await env.DB.prepare("INSERT INTO d1_migrations (id, name) VALUES (?, ?)")
      .bind(futureMigrationId, "9999_future.sql")
      .run();

    try {
      const forwardCompatibleResponse = await SELF.fetch(
        "https://worker.test/api/health/storage",
      );
      expect(forwardCompatibleResponse.status).toBe(200);

      await env.DB.prepare("DELETE FROM d1_migrations WHERE id = ?")
        .bind(requiredMigration.id)
        .run();
      return await SELF.fetch("https://worker.test/api/health/storage");
    } finally {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM d1_migrations WHERE id = ?").bind(futureMigrationId),
        env.DB.prepare("INSERT OR IGNORE INTO d1_migrations (id, name) VALUES (?, ?)").bind(
          requiredMigration.id,
          requiredMigration.name,
        ),
      ]);
    }
  })();

  expect(response.status).toBe(503);
});

test("D1 persists products, comments, and votes", async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, username) VALUES (?, ?)").bind(
      "user-author",
      "author",
    ),
    env.DB.prepare("INSERT INTO users (id, username) VALUES (?, ?)").bind(
      "user-voter",
      "voter",
    ),
    env.DB.prepare("INSERT INTO users (id, username) VALUES (?, ?)").bind(
      "user-downvoter",
      "downvoter",
    ),
    env.DB.prepare("INSERT INTO shops (id, name, url) VALUES (?, ?, ?)").bind(
      "shop-1",
      "BoothPlus Shop",
      "https://booth.pm/shops/booth-plus",
    ),
    env.DB
      .prepare(
        "INSERT INTO products (id, shop_id, title, price, url) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        "product-1",
        "shop-1",
        "Test Product",
        "1000 JPY",
        "https://booth.pm/items/product-1",
      ),
    env.DB
      .prepare(
        "INSERT INTO comments (id, product_id, user_id, content, score, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        "comment-1",
        "product-1",
        "user-author",
        "Great product",
        9,
        "2000-01-01T00:00:00.000Z",
      ),
    env.DB
      .prepare(
        "INSERT INTO comments (id, product_id, user_id, content, score) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("comment-2", "product-1", "user-voter", "Good product", 7),
    env.DB
      .prepare("INSERT INTO comment_votes (comment_id, user_id, value) VALUES (?, ?, ?)")
      .bind("comment-1", "user-voter", 1),
    env.DB
      .prepare("INSERT INTO comment_votes (comment_id, user_id, value) VALUES (?, ?, ?)")
      .bind("comment-1", "user-downvoter", -1),
  ]);

  await env.DB.prepare("UPDATE comments SET content = ? WHERE id = ?")
    .bind("Updated review", "comment-1")
    .run();

  const storedReview = await env.DB.prepare(
    `SELECT
       comments.content,
       comments.score,
       comments.updated_at AS updatedAt,
       COUNT(CASE WHEN comment_votes.value = 1 THEN 1 END) AS upvotes,
       COUNT(CASE WHEN comment_votes.value = -1 THEN 1 END) AS downvotes,
       (
         SELECT AVG(product_comments.score)
         FROM comments AS product_comments
         WHERE product_comments.product_id = comments.product_id
       ) AS productScore
     FROM comments
     LEFT JOIN comment_votes ON comment_votes.comment_id = comments.id
     WHERE comments.id = ?
     GROUP BY comments.id`,
  )
    .bind("comment-1")
    .first<{
      content: string;
      score: number;
      updatedAt: string;
      upvotes: number;
      downvotes: number;
      productScore: number;
    }>();

  expect(storedReview).toMatchObject({
    content: "Updated review",
    score: 9,
    upvotes: 1,
    downvotes: 1,
    productScore: 8,
  });
  expect(storedReview?.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
});
