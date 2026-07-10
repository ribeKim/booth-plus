const requiredTableNames = [
  "users",
  "oauth_accounts",
  "auth_sessions",
  "shops",
  "products",
  "product_thumbnails",
  "comments",
  "comment_votes",
] as const;

const requiredMigrationName = "0001_initial.sql";

type DatabaseReadinessRow = {
  isReady: number;
};

export const hasRequiredDatabaseSchema = async (database: D1Database): Promise<boolean> => {
  const placeholders = requiredTableNames.map(() => "?").join(", ");
  const row = await database
    .prepare(
      `SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM d1_migrations WHERE name = ?
         )
         AND (
           SELECT COUNT(*)
           FROM sqlite_master
           WHERE type = 'table' AND name IN (${placeholders})
         ) = ?
         THEN 1
         ELSE 0
       END AS isReady`,
    )
    .bind(requiredMigrationName, ...requiredTableNames, requiredTableNames.length)
    .first<DatabaseReadinessRow>();

  return row?.isReady === 1;
};
