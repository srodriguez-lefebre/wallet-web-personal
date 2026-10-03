import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { recordSchema } from "../../shared/schemas.js";
import {
  createRecord,
  createRecordsBulk,
  deleteRecord,
  getWalletDataset,
  recordDebtPayment,
  updateRecord,
} from "./wallet-repository.js";
import { importWalletRecords } from "./record-import.js";

const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const debtId = "00000000-0000-4000-8000-000000000003";
const date = "2026-06-21T12:00:00.000Z";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  if (fixture) await fixture.close();
}, 30_000);
beforeEach(async () => {
  await fixture.pool.query(
    "TRUNCATE accounts,categories,settings,debts,goals CASCADE",
  );
  await fixture.pool.query(
    "insert into accounts(id,name,type,currency,initial_balance,color,icon) values ($1,'Account','bank','UYU',1000,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "insert into categories(id,name,color,icon) values ($1,'Category','blue','bank')",
    [categoryId],
  );
  await fixture.pool.query(
    "insert into settings(primary_currency) values ('UYU')",
  );
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
  const result = await fixture.pool.query<{ pending_amount: string }>(
    "select pending_amount from debts where id=$1",
    [debtId],
  );
  return Number(result.rows[0].pending_amount);
}

test("reimport skips persisted deterministic IDs after an imported record is edited, while adding new rows", async () => {
  const original = input();
  const [saved] = await importWalletRecords([original]);
  await updateRecord(saved.id, { amount: 50 });
  const created = await importWalletRecords([
    original,
    input({ occurredAt: "2026-06-22T12:00:00.000Z" }),
  ]);
  expect(created).toHaveLength(1);
  const records = (await getWalletDataset()).records;
  expect(records).toHaveLength(2);
  expect(records.find((record) => record.id === saved.id)?.amount).toBe(50);
});

test("reimport skips soft-deleted deterministic identities and still inserts new history", async () => {
  const original = input();
  const [saved] = await importWalletRecords([original]);
  await deleteRecord(saved.id);
  expect(
    await importWalletRecords([
      original,
      input({ occurredAt: "2026-06-22T12:00:00.000Z" }),
    ]),
  ).toHaveLength(1);
  expect((await getWalletDataset()).records).toHaveLength(1);
  expect(
    (await fixture.pool.query("select id from records")).rows,
  ).toHaveLength(2);
});

test("an ordinary record cannot be attached to a debt through PATCH", async () => {
  const saved = await createRecord(input());
  await expect(updateRecord(saved.id, { debtId })).rejects.toThrow();
  await updateRecord(saved.id, { amount: 10 });
  expect(await pending()).toBe(100);
  expect((await getWalletDataset()).records[0].debtId).toBeUndefined();
});

test.each(["single", "bulk", "CSV"])(
  "%s creation cannot bypass the debt payment mutation",
  async (operation) => {
    const record = input({ debtId });
    const mutation =
      operation === "single"
        ? createRecord(record)
        : operation === "bulk"
          ? createRecordsBulk([input(), record])
          : importWalletRecords([record]);
    await expect(mutation).rejects.toThrow();
    expect(await pending()).toBe(100);
    expect((await getWalletDataset()).records).toEqual([]);
  },
);

test("same-debt PATCH keeps legitimate payment reconciliation and forbids detaching a payment", async () => {
  const payment = await recordDebtPayment(debtId, {
    amount: 30,
    accountId,
    occurredAt: date,
  });
  expect(await pending()).toBe(70);
  await updateRecord(payment!.record.id, { debtId, amount: 10 });
  expect(await pending()).toBe(90);
  await expect(
    updateRecord(payment!.record.id, { debtId: null }),
  ).rejects.toThrow();
  expect(await pending()).toBe(90);
});

test("CSV duplicates of existing debt payments remain no-ops without altering the debt", async () => {
  const payment = await recordDebtPayment(debtId, {
    amount: 30,
    accountId,
    occurredAt: date,
  });
  expect(await importWalletRecords([payment!.record])).toEqual([]);
  expect(await pending()).toBe(70);
  expect((await getWalletDataset()).records).toHaveLength(1);
});
