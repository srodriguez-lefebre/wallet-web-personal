import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";

import { applyMigrations } from "../../scripts/sandbox/database.js";

test("additive ingestion migration rolls back, preserves money and user aliases, and is journal-idempotent", async () => {
  const pg = new PGlite();
  try {
    const folder = new URL("../../drizzle/migrations/", import.meta.url);
    const journal = JSON.parse(await readFile(new URL("meta/_journal.json", folder), "utf8")) as {
      entries: { tag: string }[];
    };
    await pg.exec("CREATE TABLE sandbox_migrations(tag text PRIMARY KEY)");
    for (const entry of journal.entries.filter((entry) => entry.tag < "0023")) {
      await pg.exec(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"));
      await pg.query("INSERT INTO sandbox_migrations(tag) VALUES($1)", [entry.tag]);
    }
    await pg.exec(
      "INSERT INTO accounts(name,type,currency,initial_balance,color,icon) VALUES('Synthetic bank','bank','UYU',123.45,'blue','bank'); INSERT INTO categories(name,color,icon) VALUES('Taxi','blue','bank'),('Insurance','blue','bank'),('insurance','blue','bank'); INSERT INTO merchants(name,category_id) SELECT 'User choice',id FROM categories WHERE name='Taxi'; INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) SELECT id,'UBER','UBER' FROM merchants WHERE name='User choice'",
    );
    const before = await pg.query("SELECT * FROM accounts");
    const source = await readFile(new URL("0023_ingestion_policy_state.sql", folder), "utf8");
    await expect(
      pg.transaction(async (tx) => {
        await tx.exec(source);
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    expect((await pg.query("SELECT to_regclass('provider_state') AS table_name")).rows).toEqual([
      { table_name: null },
    ]);
    expect((await pg.query("SELECT system_key FROM categories WHERE name='Taxi'")).rows).toEqual([
      { system_key: null },
    ]);
    await applyMigrations(pg);
    expect(await pg.query("SELECT * FROM accounts")).toEqual(before);
    expect((await pg.query("SELECT system_key FROM categories WHERE name='Taxi'")).rows).toEqual([
      { system_key: "taxi" },
    ]);
    expect(
      (await pg.query("SELECT system_key FROM categories WHERE lower(name)='insurance'")).rows,
    ).toEqual([{ system_key: null }, { system_key: null }]);
    expect(
      (
        await pg.query(
          "SELECT m.name FROM merchants m JOIN merchant_aliases a ON m.id=a.merchant_id WHERE a.normalized_alias='UBER'",
        )
      ).rows,
    ).toEqual([{ name: "User choice" }]);
    expect(
      (await pg.query("SELECT wallet_normalize_merchant('Pañalería ** café') AS term")).rows,
    ).toEqual([{ term: "PANALERIA CAFE" }]);
    const policies = await pg.query("SELECT * FROM merchant_category_rules ORDER BY id");
    expect(policies.rows.length).toBeGreaterThan(20);
    await applyMigrations(pg);
    expect(await pg.query("SELECT * FROM merchant_category_rules ORDER BY id")).toEqual(policies);
  } finally {
    await pg.close();
  }
}, 30000);
