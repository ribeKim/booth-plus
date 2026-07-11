import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { loadConfig } from "../src/config";
import { createDatabase, type Database } from "../src/database";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

let database: Database;

beforeAll(async () => {
  const config = loadConfig(process.env);
  database = await createDatabase(config.database);
});

afterAll(async () => {
  await database.close();
});

describe("PostgreSQL persistence", () => {
  test("migrations make the writable primary ready", async () => {
    await expect(database.isReady()).resolves.toBe(true);
  });

  test("readiness follows the node-pg-migrate metadata row", async () => {
    const migrations = await database.query<{
      id: number;
      name: string;
      run_on: Date;
    }>(
      `DELETE FROM public.app_migrations
       WHERE name = $1
       RETURNING id, name, run_on`,
      ["0001_initial"],
    );

    try {
      expect(migrations).toEqual([expect.objectContaining({ name: "0001_initial" })]);
      await expect(database.isReady()).resolves.toBe(false);
    } finally {
      for (const migration of migrations) {
        await database.query(
          `INSERT INTO public.app_migrations (id, name, run_on)
           VALUES ($1, $2, $3)`,
          [migration.id, migration.name, migration.run_on],
        );
      }
    }

    await expect(database.isReady()).resolves.toBe(true);
  });

  test("the pool reconnects after PostgreSQL terminates an idle backend", async () => {
    const reconnectingDatabase = await createDatabase(loadConfig(process.env).database);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const [connection] = await reconnectingDatabase.query<{ backend_pid: number }>(
        "SELECT pg_backend_pid()::integer AS backend_pid",
      );
      expect(connection).toBeDefined();

      const [termination] = await database.query<{ terminated: boolean }>(
        "SELECT pg_terminate_backend($1, 5000) AS terminated",
        [connection?.backend_pid],
      );
      expect(termination?.terminated).toBe(true);

      // This exercises pg Pool reconnection only; it does not simulate OCI DNS failover.
      await vi.waitFor(
        () => {
          expect(errorLog).toHaveBeenCalledWith(
            "PostgreSQL idle connection failed",
            expect.any(Error),
          );
        },
        { timeout: 5_000 },
      );
      await expect(reconnectingDatabase.isReady()).resolves.toBe(true);
    } finally {
      errorLog.mockRestore();
      await reconnectingDatabase.close();
    }
  });

  test("stores products, comments, votes, and updated timestamps", async () => {
    const suffix = randomUUID();
    const authorId = `author-${suffix}`;
    const voterId = `voter-${suffix}`;
    const downvoterId = `downvoter-${suffix}`;
    const shopId = `shop-${suffix}`;
    const productId = `product-${suffix}`;
    const firstCommentId = `comment-first-${suffix}`;
    const secondCommentId = `comment-second-${suffix}`;

    try {
      await database.query("INSERT INTO users (id, username) VALUES ($1, $2), ($3, $4), ($5, $6)", [
        authorId,
        "author",
        voterId,
        "voter",
        downvoterId,
        "downvoter",
      ]);
      await database.query("INSERT INTO shops (id, name, url) VALUES ($1, $2, $3)", [
        shopId,
        "BoothPlus Shop",
        `https://booth.pm/shops/${shopId}`,
      ]);
      await database.query(
        "INSERT INTO products (id, shop_id, title, price, url) VALUES ($1, $2, $3, $4, $5)",
        [productId, shopId, "Test Product", "1000 JPY", `https://booth.pm/items/${productId}`],
      );
      await database.query(
        `INSERT INTO comments (id, product_id, user_id, content, score, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6), ($7, $2, $8, $9, $10, CURRENT_TIMESTAMP)`,
        [
          firstCommentId,
          productId,
          authorId,
          "Great product",
          9,
          new Date("2000-01-01T00:00:00.000Z"),
          secondCommentId,
          voterId,
          "Good product",
          7,
        ],
      );
      await database.query(
        `INSERT INTO comment_votes (comment_id, user_id, value)
         VALUES ($1, $2, 1), ($1, $3, -1)`,
        [firstCommentId, voterId, downvoterId],
      );

      await database.query("UPDATE comments SET content = $1 WHERE id = $2", [
        "Updated review",
        firstCommentId,
      ]);

      const [storedReview] = await database.query<{
        content: string;
        score: number;
        updated_at: Date;
        upvotes: number;
        downvotes: number;
        product_score: number;
      }>(
        `SELECT
           comments.content,
           comments.score,
           comments.updated_at,
           COUNT(*) FILTER (WHERE comment_votes.value = 1)::integer AS upvotes,
           COUNT(*) FILTER (WHERE comment_votes.value = -1)::integer AS downvotes,
           (
             SELECT AVG(product_comments.score)::double precision
             FROM comments AS product_comments
             WHERE product_comments.product_id = comments.product_id
           ) AS product_score
         FROM comments
         LEFT JOIN comment_votes ON comment_votes.comment_id = comments.id
         WHERE comments.id = $1
         GROUP BY comments.id`,
        [firstCommentId],
      );

      expect(storedReview).toMatchObject({
        content: "Updated review",
        score: 9,
        upvotes: 1,
        downvotes: 1,
        product_score: 8,
      });
      expect(storedReview?.updated_at.toISOString()).not.toBe("2000-01-01T00:00:00.000Z");

      await expect(
        database.query(
          "INSERT INTO comment_votes (comment_id, user_id, value) VALUES ($1, $2, 0)",
          [firstCommentId, authorId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await database.query("DELETE FROM products WHERE id = $1", [productId]);
      await database.query("DELETE FROM shops WHERE id = $1", [shopId]);
      await database.query("DELETE FROM users WHERE id = ANY($1::text[])", [
        [authorId, voterId, downvoterId],
      ]);
    }
  });
});
