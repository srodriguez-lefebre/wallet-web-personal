import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { recordSchema } from "../../shared/schemas.js";
import { createDb } from "./client.js";
import {
  createRecord,
  createRecordsBulk,
  deleteRecord,
  getWalletDataset,
  recordDebtPayment,
  updateRecord,
} from "./index.js";
import { importWalletRecords } from "./record-import.js";
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const debtId = "00000000-0000-4000-8000-000000000003";
const date = "2026-06-21T12:00:00.000Z";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  if (fixture) await fixture.close();
}, 30000);
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts,categories,settings,debts,goals CASCADE");
  await fixture.pool.query(
    "insert into accounts(id,name,type,currency,initial_balance,color,icon) values ($1,'Account','bank','UYU',1000,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "insert into categories(id,name,color,icon) values ($1,'Category','blue','bank')",
    [categoryId],
  );
  await fixture.pool.query("insert into settings(primary_currency) values ('UYU')");
  await fixture.pool.query(
    "insert into debts(id,name,direction,currency,original_amount,pending_amount,counterparty_name,category_id,started_at) values ($1,'Debt','payable','UYU',100,100,'Party',$2,$3)",
    [debtId, categoryId, date],
  );
});
const input = (overrides = {}) =>
  recordSchema.parse({
    type: "expense",
    amount: 30,
    currency: "UYU",
    accountId,
    categoryId,
    paymentType: "debit",
    paymentStatus: "cleared",
    occurredAt: date,
    ...overrides,
  });
async function pending() {
  const result = await fixture.pool.query<{
    pending_amount: string;
  }>("select pending_amount from debts where id=$1", [debtId]);
  return Number(result.rows[0]!.pending_amount);
}
test("reimport skips persisted deterministic IDs after an imported record is edited, while adding new rows", async () => {
  const original = input();
  const [saved] = await importWalletRecords(createDb(), [original]);
  if (!saved) throw new Error("Expected synthetic imported record");
  await updateRecord(createDb(), saved.id, { amount: 50 });
  const created = await importWalletRecords(createDb(), [
    original,
    input({ occurredAt: "2026-06-22T12:00:00.000Z" }),
  ]);
  expect(created).toHaveLength(1);
  const records = (await getWalletDataset(createDb())).records;
  expect(records).toHaveLength(2);
  expect(records.find((record) => record.id === saved.id)?.amount).toBe(50);
});
test("reimport skips soft-deleted deterministic identities and still inserts new history", async () => {
  const original = input();
  const [saved] = await importWalletRecords(createDb(), [original]);
  if (!saved) throw new Error("Expected synthetic imported record");
  await deleteRecord(createDb(), saved.id);
  expect(
    await importWalletRecords(createDb(), [
      original,
      input({ occurredAt: "2026-06-22T12:00:00.000Z" }),
    ]),
  ).toHaveLength(1);
  expect((await getWalletDataset(createDb())).records).toHaveLength(1);
  expect((await fixture.pool.query("select id from records")).rows).toHaveLength(2);
});
test("an ordinary record cannot be attached to a debt through PATCH", async () => {
  const saved = await createRecord(createDb(), input());
  await expect(updateRecord(createDb(), saved.id, { debtId })).rejects.toThrow();
  await updateRecord(createDb(), saved.id, { amount: 10 });
  expect(await pending()).toBe(100);
  expect((await getWalletDataset(createDb())).records[0]!.debtId).toBeUndefined();
});
test.each(["single", "bulk", "CSV"])(
  "%s creation cannot bypass the debt payment mutation",
  async (operation) => {
    const record = input({ debtId });
    const mutation =
      operation === "single"
        ? createRecord(createDb(), record)
        : operation === "bulk"
          ? createRecordsBulk(createDb(), [input(), record])
          : importWalletRecords(createDb(), [record]);
    await expect(mutation).rejects.toThrow();
    expect(await pending()).toBe(100);
    expect((await getWalletDataset(createDb())).records).toEqual([]);
  },
);
test("same-debt PATCH keeps legitimate payment reconciliation and forbids detaching a payment", async () => {
  const payment = await recordDebtPayment(createDb(), debtId, {
    amount: 30,
    accountId,
    occurredAt: date,
  });
  expect(await pending()).toBe(70);
  await updateRecord(createDb(), payment!.record.id, { debtId, amount: 10 });
  expect(await pending()).toBe(90);
  await expect(updateRecord(createDb(), payment!.record.id, { debtId: null })).rejects.toThrow();
  expect(await pending()).toBe(90);
});
test("paying the final cents closes the debt and a retry uses the original request identity", async () => {
  const request = {
    amount: 99.995,
    accountId,
    occurredAt: date,
    idempotencyKey: "00000000-0000-4000-8000-000000000004",
  };
  const payment = await recordDebtPayment(createDb(), debtId, request);
  expect(payment?.record).toMatchObject({ amount: 100, accountAmount: 100 });
  expect(payment?.debt).toMatchObject({ pendingAmount: 0, status: "paid" });
  expect((await recordDebtPayment(createDb(), debtId, request))?.record.id).toBe(
    payment?.record.id,
  );
  expect((await getWalletDataset(createDb())).records).toHaveLength(1);
});

test("CSV duplicates of existing debt payments remain no-ops without altering the debt", async () => {
  const payment = await recordDebtPayment(createDb(), debtId, {
    amount: 30,
    accountId,
    occurredAt: date,
  });
  expect(await importWalletRecords(createDb(), [payment!.record])).toEqual([]);
  expect(await pending()).toBe(70);
  expect((await getWalletDataset(createDb())).records).toHaveLength(1);
});
