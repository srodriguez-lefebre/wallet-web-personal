import { randomUUID } from "node:crypto";

import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDb } from "./client.js";
import { getWalletBackup, getWalletDataset } from "./index.js";
import { restoreWalletBackup } from "./wallet-restore.js";
import { resolveCategory } from "../ingestion/category-resolution.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(),
  categoryId = randomUUID(),
  merchantId = randomUUID(),
  goalId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts, categories, goals, settings, merchants CASCADE");
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test bank','bank','UYU',500,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Restore category','blue','bank')",
    [categoryId],
  );
  await fixture.pool.query(
    "INSERT INTO merchants(id,name,category_id,priority) VALUES($1,'Restore merchant',$2,3)",
    [merchantId, categoryId],
  );
  await fixture.pool.query(
    "INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) VALUES($1,'RESTORE STORE','restore store')",
    [merchantId],
  );
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
});
test("legacy backup preserves merchant rules and remaps equivalent categories before atomic replacement", async () => {
  const backup = await getWalletDataset(createDb());
  // Older snapshots did not carry these optional configuration collections.
  const oldBackup = { ...backup } as Record<string, unknown>;
  delete oldBackup.merchants;
  delete oldBackup.merchantAliases;
  const replacementId = randomUUID();
  backup.categories.find((category) => category.id === categoryId)!.id = replacementId;
  await restoreWalletBackup(createDb(), oldBackup);
  const merchants = await fixture.pool.query(
    "SELECT id, category_id, priority FROM merchants WHERE id=$1",
    [merchantId],
  );
  expect(merchants.rows).toEqual([{ id: merchantId, category_id: replacementId, priority: 3 }]);
  const aliases = await fixture.pool.query(
    "SELECT merchant_id, alias, normalized_alias FROM merchant_aliases",
  );
  expect(aliases.rows).toEqual([
    { merchant_id: merchantId, alias: "RESTORE STORE", normalized_alias: "restore store" },
  ]);
});
test("unmappable merchant rules reject an old snapshot without deleting current history", async () => {
  const backup = { ...(await getWalletDataset(createDb())) } as Record<string, unknown>;
  delete backup.merchants;
  delete backup.merchantAliases;
  backup.categories = [];
  await expect(restoreWalletBackup(createDb(), backup)).rejects.toThrow();
  expect((await fixture.pool.query("SELECT id FROM merchants")).rows).toEqual([{ id: merchantId }]);
  expect((await fixture.pool.query("SELECT id FROM accounts")).rows).toEqual([{ id: accountId }]);
});
test("full backup restores merchant configuration and migrated reserve ledger without legacy FK blockers", async () => {
  await fixture.pool.query(
    "INSERT INTO goals(id,name,target_amount,currency,color,icon) VALUES($1,'Restore goal',100,'UYU','blue','bank')",
    [goalId],
  );
  await fixture.pool.query(
    "INSERT INTO goal_reservations(goal_id,account_id,amount,currency) VALUES($1,$2,50,'UYU')",
    [goalId, accountId],
  );
  // Migration0013 copied the old balance to a ledger row but retained the source table.
  await fixture.pool.query(
    "INSERT INTO goal_reservation_movements(goal_id,account_id,type,amount,currency) VALUES($1,$2,'reserve',50,'UYU')",
    [goalId, accountId],
  );
  const backup = await getWalletBackup(createDb());
  await fixture.pool.query("UPDATE merchants SET priority=99 WHERE id=$1", [merchantId]);
  await restoreWalletBackup(createDb(), backup);
  const restored = await getWalletDataset(createDb());
  expect(restored.goalReservationMovements).toEqual(backup.goalReservationMovements);
  expect(restored.goalReservations.map((row) => row.amount)).toEqual([50]);
  expect((await fixture.pool.query("SELECT * FROM goal_reservations")).rows).toHaveLength(0);
  expect(
    (await fixture.pool.query("SELECT priority FROM merchants WHERE id=$1", [merchantId])).rows,
  ).toEqual([{ priority: 3 }]);
  expect((await fixture.pool.query("SELECT normalized_alias FROM merchant_aliases")).rows).toEqual([
    { normalized_alias: "restore store" },
  ]);
});
test("legacy restore retains ingestion committed after preparation and before the table lock", async () => {
  const backup = { ...(await getWalletBackup(createDb())) } as Record<string, unknown>;
  delete backup.ingestionEvents;
  const eventId = randomUUID();
  const transport = neonConfig.fetchFunction!;
  let injected = false;
  neonConfig.fetchFunction = async (url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as {
      queries?: {
        query: string;
      }[];
    };
    if (!injected && body.queries?.some((item) => item.query.includes("LOCK TABLE"))) {
      injected = true;
      await fixture.pool.query(
        "INSERT INTO ingestion_events(id,idempotency_key,source,status,fingerprint) VALUES($1,$2,'test','completed','retained-fingerprint')",
        [eventId, `race:${eventId}`],
      );
    }
    return transport(url, options);
  };
  try {
    await restoreWalletBackup(createDb(), backup);
    expect(injected).toBe(true);
    expect(
      (
        await fixture.pool.query("SELECT id,status,fingerprint FROM ingestion_events WHERE id=$1", [
          eventId,
        ])
      ).rows,
    ).toEqual([{ id: eventId, status: "completed", fingerprint: "retained-fingerprint" }]);
  } finally {
    neonConfig.fetchFunction = transport;
  }
});
test("legacy restore prunes ingestion references and all duplicate descendants outside the snapshot", async () => {
  const backup = { ...(await getWalletBackup(createDb())) } as Record<string, unknown>;
  delete backup.ingestionEvents;
  const recordId = randomUUID(),
    original = randomUUID(),
    child = randomUUID(),
    grandchild = randomUUID();
  await fixture.pool.query(
    "INSERT INTO records(id,type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',1,'UYU',$2,$3,'debit','cleared',1,now())",
    [recordId, accountId, categoryId],
  );
  await fixture.pool.query(
    "INSERT INTO ingestion_events(id,idempotency_key,source,status,record_id) VALUES($1,$2,'test','completed',$3)",
    [original, `original:${original}`, recordId],
  );
  for (const [id, parent] of [
    [child, original],
    [grandchild, child],
  ])
    await fixture.pool.query(
      "INSERT INTO ingestion_events(id,idempotency_key,source,status,duplicate_of_id) VALUES($1,$2,'test','duplicate',$3)",
      [id, `duplicate:${id}`, parent],
    );
  await restoreWalletBackup(createDb(), backup);
  expect((await fixture.pool.query("SELECT id FROM ingestion_events")).rows).toEqual([]);
});

test("fresh legacy restore assigns canonical keys before ingestion without changing explicit keys", async () => {
  const backup = await getWalletBackup(createDb());
  backup.categories.find((c) => c.id === categoryId)!.name = "Taxi";
  const explicit = randomUUID();
  backup.categories.push({
    ...backup.categories[0]!,
    id: explicit,
    name: "Bakery",
    systemKey: "custom_preserved",
  });
  await fixture.pool.query("TRUNCATE merchants,categories CASCADE");
  await restoreWalletBackup(createDb(), backup);
  expect(
    (await fixture.pool.query("SELECT system_key FROM categories WHERE id=$1", [categoryId])).rows,
  ).toEqual([{ system_key: "taxi" }]);
  expect(
    (await fixture.pool.query("SELECT system_key FROM categories WHERE id=$1", [explicit])).rows,
  ).toEqual([{ system_key: "custom_preserved" }]);
  expect(await resolveCategory(createDb(), "UBER SYNTHETIC RESTORED")).toMatchObject({
    categoryId,
    source: "generic_rule",
    needsReview: false,
  });
});

test("legacy backup with changed category IDs preserves keyed current merchant mappings", async () => {
  await fixture.pool.query("UPDATE categories SET system_key='custom_restore_key' WHERE id=$1", [
    categoryId,
  ]);
  const backup = await getWalletBackup(createDb());
  const nextId = randomUUID();
  backup.categories.find((c) => c.id === categoryId)!.id = nextId;
  backup.categories.find((c) => c.id === nextId)!.systemKey = undefined;
  const legacy = { ...backup } as Record<string, unknown>;
  delete legacy.merchants;
  delete legacy.merchantAliases;
  await restoreWalletBackup(createDb(), legacy);
  expect(
    (await fixture.pool.query("SELECT category_id FROM merchants WHERE id=$1", [merchantId])).rows,
  ).toEqual([{ category_id: nextId }]);
  expect(
    (await fixture.pool.query("SELECT system_key FROM categories WHERE id=$1", [nextId])).rows,
  ).toEqual([{ system_key: "custom_restore_key" }]);
});

test("ambiguous canonical key in a legacy backup rejects the complete replacement", async () => {
  const backup = await getWalletBackup(createDb());
  backup.categories.find((c) => c.id === categoryId)!.name = "Taxi";
  backup.categories.push({ ...backup.categories[0]!, id: randomUUID(), name: "taxi" });
  await expect(restoreWalletBackup(createDb(), backup)).rejects.toThrow(/ambiguous/i);
  expect(
    (await fixture.pool.query("SELECT name FROM categories WHERE id=$1", [categoryId])).rows,
  ).toEqual([{ name: "Restore category" }]);
  expect((await fixture.pool.query("SELECT id FROM merchants")).rows).toEqual([{ id: merchantId }]);
});
