import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { batchAssert, lockRows, namedBatch } from "./batch.js";
import { createDb } from "./client.js";
import { isPgError } from "./pg-error.js";
import { accounts, creditCards } from "./schema.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});

test("failed batch guards roll back preceding writes with the existing financial error code", async () => {
  const db = createDb();
  const [account] = await db
    .insert(accounts)
    .values({
      name: "Synthetic guard bank",
      type: "bank",
      currency: "UYU",
      initialBalance: "10",
      color: "blue",
      icon: "bank",
    })
    .returning();
  if (!account) throw new Error("Missing fixture account");
  const error = await db
    .batch([
      db.update(accounts).set({ initialBalance: "999" }),
      batchAssert(db, sql`false`, "synthetic_guard"),
    ])
    .catch((failure: unknown) => failure);
  expect(isPgError(error, "22012")).toBe(true);
  expect((await db.select().from(accounts))[0]?.initialBalance).toBe("10.00");
});
test("row locks deduplicate and sort ids without updating card metadata", async () => {
  const db = createDb();
  const rows = await db
    .insert(creditCards)
    .values(
      ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"].map(
        (id, index) => ({
          id,
          name: `Synthetic locked ${index}`,
          issuer: "Test",
          lastFour: `000${index}`,
          creditLimit: "100",
          limitCurrency: "UYU",
          closingDay: 5,
          dueDay: 10,
          color: "blue",
          icon: "card",
        }),
      ),
    )
    .returning();
  const queries = lockRows(db, creditCards, [rows[1]!.id, rows[0]!.id, rows[1]!.id]);
  expect(queries).toHaveLength(2);
  expect(queries.map((query) => query.toSQL().params[0])).toEqual(rows.map((row) => row.id).sort());
  await db.batch(queries as [(typeof queries)[number], ...typeof queries]);
  expect(
    (await db.select().from(creditCards)).map((row) => row.updatedAt.toISOString()).sort(),
  ).toEqual(rows.map((row) => row.updatedAt.toISOString()).sort());
});

test("named batches keep query order and expose typed results by name", async () => {
  const db = createDb();
  const result = await namedBatch(db, {
    bank: db.select().from(accounts),
    check: db.execute(sql`SELECT 42 AS n`),
  });
  expect(Object.keys(result)).toEqual(["bank", "check"]);
  expect(result.bank[0]?.name).toBe("Synthetic guard bank");
  expect(result.check.rows).toEqual([{ n: 42 }]);
});
