import { sql } from "drizzle-orm";

import { referenceNotFoundError } from "../api/errors.js";
import { isPgError } from "./pg-error.js";
import { batchAssert } from "./batch.js";
import { categories } from "./schema.js";

import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "./input-types.js";

const categoryLockKey = 1791000024;

export function lockCategoryWrites(db: Db) {
  return db.execute(sql`SELECT pg_advisory_xact_lock(${categoryLockKey})`);
}

export function lockCategoryReferences(db: Db) {
  return db.execute(sql`SELECT pg_advisory_xact_lock_shared(${categoryLockKey})`);
}

// Read active references after acquiring the advisory lock. Holding the shared
// lock through commit lets archive and merge see every completed assignment.
export function categoryReferenceQueries(
  db: Db,
  categoryIds: readonly (string | null | undefined)[],
) {
  const ids = [...new Set(categoryIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return [lockCategoryReferences(db)] as const;
  const values = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return [
    lockCategoryReferences(db),
    batchAssert(
      db,
      sql`(SELECT count(*) FROM ${categories}
      WHERE deleted_at IS NULL AND id IN (${values})) = ${ids.length}`,
      "active_categories",
    ),
  ] as const;
}

export async function writeCategoryReferences<T extends BatchItem<"pg">>(
  db: Db,
  ids: readonly (string | null | undefined)[],
  write: T,
): Promise<T["_"]["result"]> {
  try {
    const results = await db.batch([...categoryReferenceQueries(db, ids), write]);
    return results.at(-1);
  } catch (error) {
    await rejectUnavailableCategories(db, ids, error);
    throw error;
  }
}

export async function rejectUnavailableCategories(
  db: Db,
  categoryIds: readonly (string | null | undefined)[],
  error: unknown,
) {
  if (!isPgError(error, "22012")) return;
  const ids = [...new Set(categoryIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const { rows } = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int FROM ${categories} WHERE deleted_at IS NULL
    AND id IN (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
  if (rows[0]?.count !== ids.length) throw referenceNotFoundError("Choose an active category");
}
