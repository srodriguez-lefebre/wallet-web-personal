import { afterAll, beforeAll, expect, test } from "vitest";
import { neonConfig } from "@neondatabase/serverless";

import { createPostgresTestDatabase } from "./sandbox/postgres-test";
import { createDb } from "../server/db/client";
import { migrationManifest } from "./db-preflight";
import { applyIngestionMigration, inspectIngestionMigration } from "./migrate-ingestion";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query(
    "DROP INDEX merchant_aliases_search_idx; DROP INDEX record_merchant_correction_search_idx; DROP FUNCTION wallet_normalize_merchant(text); DROP TABLE merchant_category_rules,provider_state; CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
  );
  for (const entry of (await migrationManifest()).filter((entry) => entry.tag < "0023"))
    await fixture.pool.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
      [entry.legacyHashes[0] ?? entry.hash, entry.when],
    );
  await fixture.pool.query(
    "INSERT INTO categories(name,color,icon) VALUES('Taxi','blue','bank'); INSERT INTO accounts(name,type,currency,initial_balance,color,icon) VALUES('Synthetic migration account','bank','UYU',123.45,'blue','bank')",
  );
  await fixture.pool.query(
    "INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,debt_id) SELECT 'expense',1,'UYU',a.id,c.id,'debit','cleared',1,'2026-01-01','00000000-0000-4000-8000-000000000001'::uuid FROM accounts a CROSS JOIN categories c WHERE a.name='Synthetic migration account' AND c.name='Taxi'",
  );
}, 60000);
afterAll(async () => {
  await fixture?.close();
});

test("a late journal failure rolls back the entire real Neon HTTP migration batch", async () => {
  expect(await inspectIngestionMigration(createDb())).toMatchObject({
    readyToApply: true,
    historicalOrphanDebtsPresent: true,
  });
  await fixture.pool.query(
    "CREATE FUNCTION reject_ingestion_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic journal failure'; END $$; CREATE TRIGGER reject_ingestion_journal BEFORE INSERT ON drizzle.__drizzle_migrations FOR EACH ROW EXECUTE FUNCTION reject_ingestion_journal()",
  );
  try {
    await expect(applyIngestionMigration(createDb())).rejects.toThrow();
  } finally {
    await fixture.pool.query(
      "DROP TRIGGER reject_ingestion_journal ON drizzle.__drizzle_migrations; DROP FUNCTION reject_ingestion_journal()",
    );
  }
  expect(
    (
      await fixture.pool.query(
        "SELECT to_regclass('public.provider_state')::text AS table_name,to_regprocedure('wallet_normalize_merchant(text)')::text AS normalizer",
      )
    ).rows,
  ).toEqual([{ table_name: null, normalizer: null }]);
  expect(
    (await fixture.pool.query("SELECT system_key FROM categories WHERE name='Taxi'")).rows,
  ).toEqual([{ system_key: null }]);
  expect(
    (await fixture.pool.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"))
      .rows,
  ).toEqual([{ count: 23 }]);
});
test("successful migration keeps the old journal and money intact, and a repeat is a read-only no-op", async () => {
  const before = (
    await fixture.pool.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id",
    )
  ).rows;
  const transport = neonConfig.fetchFunction as (
    input: string,
    options: RequestInit,
  ) => Promise<Response>;
  let responseLost = false;
  neonConfig.fetchFunction = async (input: string, options: RequestInit) => {
    const result = await transport(input, options);
    if (typeof options.body !== "string")
      throw new Error("Synthetic transport requires a JSON body");
    const body = JSON.parse(options.body) as { queries?: { query: string }[] };
    if (
      !responseLost &&
      result.ok &&
      body.queries?.some((query) => /^INSERT INTO drizzle\.__drizzle_migrations/i.test(query.query))
    ) {
      responseLost = true;
      throw new Error("Synthetic response lost after commit");
    }
    return result;
  };
  try {
    expect(await applyIngestionMigration(createDb())).toMatchObject({
      status: "applied",
      uncertainResponseRecovered: true,
    });
  } finally {
    neonConfig.fetchFunction = transport;
  }
  expect(responseLost).toBe(true);
  expect(
    (
      await fixture.pool.query(
        "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id LIMIT 23",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await fixture.pool.query(
        "SELECT initial_balance FROM accounts WHERE name='Synthetic migration account'",
      )
    ).rows,
  ).toEqual([{ initial_balance: "123.45" }]);
  expect(
    (await fixture.pool.query("SELECT system_key FROM categories WHERE name='Taxi'")).rows,
  ).toEqual([{ system_key: "taxi" }]);
  const after = (
    await fixture.pool.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id",
    )
  ).rows;
  expect(after).toHaveLength(24);
  expect(await applyIngestionMigration(createDb())).toMatchObject({ status: "already_applied" });
  expect(
    (
      await fixture.pool.query(
        "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id",
      )
    ).rows,
  ).toEqual(after);
});
