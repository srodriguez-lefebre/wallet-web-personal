import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { getWalletBackup, getWalletDataset } from "./wallet-repository.js";
import { restoreWalletBackup } from "./wallet-restore.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(), categoryId = randomUUID(), merchantId = randomUUID(), goalId = randomUUID();
beforeAll(async () => { fixture = await createPostgresTestDatabase(); }, 60_000);
afterAll(async () => { await fixture?.close(); });
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts, categories, goals, settings, merchants CASCADE");
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test bank','bank','UYU',500,'blue','bank')", [accountId]);
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Restore category','blue','bank')", [categoryId]);
  await fixture.pool.query("INSERT INTO merchants(id,name,category_id,priority) VALUES($1,'Restore merchant',$2,3)", [merchantId, categoryId]);
  await fixture.pool.query("INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) VALUES($1,'RESTORE STORE','restore store')", [merchantId]);
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
});

test("legacy backup preserves merchant rules and remaps equivalent categories before atomic replacement", async () => {
  const backup = await getWalletDataset();
  // Older snapshots did not carry these optional configuration collections.
  const oldBackup = { ...backup } as Record<string, unknown>;
  delete oldBackup.merchants;
  delete oldBackup.merchantAliases;
  const replacementId = randomUUID();
  backup.categories.find(category => category.id === categoryId)!.id = replacementId;
  await restoreWalletBackup(oldBackup);
  const merchants = await fixture.pool.query("SELECT id, category_id, priority FROM merchants WHERE id=$1", [merchantId]);
  expect(merchants.rows).toEqual([{ id: merchantId, category_id: replacementId, priority: 3 }]);
  const aliases = await fixture.pool.query("SELECT merchant_id, alias, normalized_alias FROM merchant_aliases");
  expect(aliases.rows).toEqual([{ merchant_id: merchantId, alias: "RESTORE STORE", normalized_alias: "restore store" }]);
});

test("unmappable merchant rules reject an old snapshot without deleting current history", async () => {
  const backup = { ...await getWalletDataset() } as Record<string, unknown>;
  delete backup.merchants;
  delete backup.merchantAliases;
  backup.categories = [];
  await expect(restoreWalletBackup(backup)).rejects.toThrow();
  expect((await fixture.pool.query("SELECT id FROM merchants")).rows).toEqual([{ id: merchantId }]);
  expect((await fixture.pool.query("SELECT id FROM accounts")).rows).toEqual([{ id: accountId }]);
});

test("full backup restores merchant configuration and migrated reserve ledger without legacy FK blockers", async () => {
  await fixture.pool.query("INSERT INTO goals(id,name,target_amount,currency,color,icon) VALUES($1,'Restore goal',100,'UYU','blue','bank')", [goalId]);
  await fixture.pool.query("INSERT INTO goal_reservations(goal_id,account_id,amount,currency) VALUES($1,$2,50,'UYU')", [goalId, accountId]);
  // Migration0013 copied the old balance to a ledger row but retained the source table.
  await fixture.pool.query("INSERT INTO goal_reservation_movements(goal_id,account_id,type,amount,currency) VALUES($1,$2,'reserve',50,'UYU')", [goalId, accountId]);
  const backup = await getWalletBackup();
  await fixture.pool.query("UPDATE merchants SET priority=99 WHERE id=$1", [merchantId]);
  await restoreWalletBackup(backup);
  const restored = await getWalletDataset();
  expect(restored.goalReservationMovements).toEqual(backup.goalReservationMovements);
  expect(restored.goalReservations.map(row => row.amount)).toEqual([50]);
  expect((await fixture.pool.query("SELECT * FROM goal_reservations")).rows).toHaveLength(0);
  expect((await fixture.pool.query("SELECT priority FROM merchants WHERE id=$1", [merchantId])).rows).toEqual([{ priority: 3 }]);
  expect((await fixture.pool.query("SELECT normalized_alias FROM merchant_aliases")).rows).toEqual([{ normalized_alias: "restore store" }]);
});
