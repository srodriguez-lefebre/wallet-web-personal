import { getTableColumns, sql } from "drizzle-orm";

import { categories } from "./schema.js";

import type { CategoryKind } from "../../shared/schemas/categories.js";
import type { Db } from "./input-types.js";

// This projection is valid on both sides of migration 0024. After it runs
// PostgreSQL includes the new column in the composite row automatically.
export const categoryReadColumns = {
  ...getTableColumns(categories),
  kind: sql<CategoryKind | null>`to_jsonb(${categories})->>'kind'`,
};

export type CategoryRow = Omit<typeof categories.$inferSelect, "kind"> & {
  kind: CategoryKind | null;
};

export async function categoryKindAvailable(db: Db) {
  const { rows } = await db.execute<{ available: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'categories'::regclass
      AND attname = 'kind' AND NOT attisdropped
    ) AS available
  `);
  return Boolean(rows[0]?.available);
}
