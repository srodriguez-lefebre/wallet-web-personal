import { sql, type SQL, type Table } from "drizzle-orm";

import type { BatchItem } from "drizzle-orm/batch";
import type { DbClient } from "./client.js";

/** Abort a Neon HTTP batch with 22012; callers retain their public error mapping. */
export function batchAssert(db: DbClient, condition: SQL, label = "valid") {
  return db.execute(
    sql`SELECT 1 / CASE WHEN (${condition}) THEN 1 ELSE 0 END AS ${sql.identifier(label)}`,
  );
}

/** A stable lock order prevents opposite input orders from producing deadlocks. */
export function lockRows(db: DbClient, table: Table, ids: readonly string[]) {
  return [...new Set(ids)].sort().map((id) =>
    db
      .select({ id: sql<string>`id` })
      .from(sql`${table}`)
      .where(sql`id = ${id}::uuid`)
      .for("update"),
  );
}

/** Preserve insertion order inside one Neon transaction while naming every result. */
export async function namedBatch<T extends Record<string, BatchItem<"pg">>>(
  db: DbClient,
  queries: T,
): Promise<{ [K in keyof T]: T[K]["_"]["result"] }> {
  const entries = Object.entries(queries);
  if (!entries.length) throw new Error("A named batch requires at least one query");
  const results: unknown[] = await db.batch(
    entries.map(([, query]) => query) as [BatchItem<"pg">, ...BatchItem<"pg">[]],
  );
  return Object.fromEntries(entries.map(([key], index) => [key, results[index]])) as {
    [K in keyof T]: T[K]["_"]["result"];
  };
}
