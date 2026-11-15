import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { calculateAccountBalances } from "../../shared/balances.js";
import { calculateVisibleDebtSummary } from "../../shared/debts.js";
import { createDb } from "./client.js";
import {
  createDebt,
  createRecord,
  deleteRecord,
  generateDueRecurringDebts,
  getWalletDataset,
  recordDebtPayment,
  updateAccount,
  updateRecord,
  upsertSettings,
} from "./index.js";
import { importWalletRecords } from "./record-import.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(),
  dollarAccount = randomUUID(),
  categoryId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.pool.query(
    "TRUNCATE records, accounts, categories, debts, recurring_debts, settings, exchange_rates CASCADE",
  );
  await fixture.pool.query(
    "INSERT INTO accounts (id,name,type,currency,initial_balance,color,icon) VALUES ($1,'Pesos','bank','UYU',5000,'blue','bank'),($2,'Dollars','bank','USD',0,'blue','bank')",
    [accountId, dollarAccount],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')",
    [categoryId],
  );
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await fixture.pool.query(
    "INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',40,'2026-01-01')",
  );
});
const debtInput = {
  name: "Test",
  direction: "payable" as const,
  currency: "USD" as const,
  originalAmount: 200,
  pendingAmount: 200,
  counterpartyName: "Test",
  categoryId,
  status: "active" as const,
  isVisible: true,
  startedAt: "2026-01-01T12:00:00Z",
};
const payment = { amount: 100, accountId, occurredAt: "2026-02-01T12:00:00Z" };
test("debt payment freezes separate account and reporting amounts and retries only once", async () => {
  const debt = await createDebt(createDb(), debtInput),
    idempotencyKey = randomUUID();
  const first = await recordDebtPayment(createDb(), debt.id, { ...payment, idempotencyKey });
  const second = await recordDebtPayment(createDb(), debt.id, { ...payment, idempotencyKey });
  expect(first!.record.accountAmount).toBe(4000);
  expect(first!.record.exchangeRateToPrimary).toBe(40);
  expect(second!.record.id).toBe(first!.record.id);
  const dataset = await getWalletDataset(createDb());
  expect(
    calculateAccountBalances(dataset, new Date()).find((item) => item.account.id === accountId)!
      .balance,
  ).toBe(1000);
  expect(calculateVisibleDebtSummary(dataset, new Date()).toPay).toBe(4000);
});
test("cancelling, editing and deleting payments reconciles the debt atomically", async () => {
  const debt = await createDebt(createDb(), debtInput);
  const result = await recordDebtPayment(createDb(), debt.id, payment);
  await updateRecord(createDb(), result!.record.id, { amount: 50, accountAmount: 2000 });
  expect((await getWalletDataset(createDb())).debts[0]!.pendingAmount).toBe(150);
  await updateRecord(createDb(), result!.record.id, { paymentStatus: "cancelled" });
  expect((await getWalletDataset(createDb())).debts[0]!.pendingAmount).toBe(200);
  await updateRecord(createDb(), result!.record.id, { paymentStatus: "cleared" });
  expect((await getWalletDataset(createDb())).debts[0]!.pendingAmount).toBe(150);
  await deleteRecord(createDb(), result!.record.id);
  await deleteRecord(createDb(), result!.record.id);
  expect((await getWalletDataset(createDb())).debts[0]!.pendingAmount).toBe(200);
});
test("simultaneous payments cannot overpay or partially insert a financial record", async () => {
  const debt = await createDebt(createDb(), {
    ...debtInput,
    originalAmount: 100,
    pendingAmount: 100,
  });
  const results = await Promise.allSettled([
    recordDebtPayment(createDb(), debt.id, { ...payment, amount: 75 }),
    recordDebtPayment(createDb(), debt.id, { ...payment, amount: 75 }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const dataset = await getWalletDataset(createDb());
  expect(dataset.debts[0]!.pendingAmount).toBe(25);
  expect(dataset.records).toHaveLength(1);
});
test("reviewing a valid debt payment preserves the debt payment and bank balance", async () => {
  const debt = await createDebt(createDb(), debtInput);
  const result = await recordDebtPayment(createDb(), debt.id, payment);
  await updateRecord(createDb(), result!.record.id, { paymentStatus: "needs_review" });
  expect((await getWalletDataset(createDb())).debts[0]!.pendingAmount).toBe(100);
  expect(
    calculateAccountBalances(await getWalletDataset(createDb()), new Date()).find(
      (item) => item.account.id === accountId,
    )!.balance,
  ).toBe(1000);
  await updateRecord(createDb(), result!.record.id, { paymentStatus: "cleared" });
  expect((await getWalletDataset(createDb())).debts[0]!.pendingAmount).toBe(100);
});
test("unclassified review history with unknown primary conversion can be cancelled and retried without a bank assignment", async () => {
  const record = await createRecord(createDb(), {
    type: "expense",
    amount: 10,
    currency: "USD",
    tagIds: [],
    paymentType: "cash",
    paymentStatus: "needs_review",
    exchangeRateToPrimary: 0,
    occurredAt: payment.occurredAt,
  });
  await expect(updateRecord(createDb(), record.id, { paymentStatus: "cleared" })).rejects.toThrow();
  await updateRecord(createDb(), record.id, { paymentStatus: "cancelled" });
  await updateRecord(createDb(), record.id, { paymentStatus: "cancelled" });
  const dataset = await getWalletDataset(createDb());
  expect(dataset.records.find((row) => row.id === record.id)!).toMatchObject({
    paymentStatus: "cancelled",
    exchangeRateToPrimary: 0,
  });
  expect(dataset.records[0]!.accountId).toBeUndefined();
  expect(dataset.records[0]!.categoryId).toBeUndefined();
  expect(
    calculateAccountBalances(dataset, new Date()).find((item) => item.account.id === accountId)!
      .totalBalance,
  ).toBe(5000);
});
test("cross currency transfer persists the actual amount received", async () => {
  const input = {
    type: "transfer" as const,
    amount: 4000,
    currency: "UYU" as const,
    accountId,
    destinationAccountId: dollarAccount,
    destinationAmount: 100,
    tagIds: [],
    paymentType: "transfer" as const,
    paymentStatus: "cleared" as const,
    exchangeRateToPrimary: 1,
    occurredAt: payment.occurredAt,
  };
  await createRecord(createDb(), input);
  const balances = calculateAccountBalances(await getWalletDataset(createDb()), new Date());
  expect(balances.find((item) => item.account.id === accountId)!.balance).toBe(1000);
  expect(balances.find((item) => item.account.id === dollarAccount)!.balance).toBe(100);
  await expect(
    createRecord(createDb(), { ...input, destinationAmount: undefined }),
  ).rejects.toThrow();
});
test("primary currency cannot relabel frozen financial history", async () => {
  const debt = await createDebt(createDb(), debtInput);
  await recordDebtPayment(createDb(), debt.id, payment);
  const dataset = await getWalletDataset(createDb());
  await expect(
    upsertSettings(createDb(), { ...dataset.settings, primaryCurrency: "USD" }),
  ).rejects.toThrow("moneda principal");
});
test("account currencies cannot relabel bank history while an unused empty account can change", async () => {
  await expect(updateAccount(createDb(), accountId, { currency: "USD" })).rejects.toThrow();
  await updateAccount(createDb(), dollarAccount, { currency: "UYU" });
  await createRecord(createDb(), {
    type: "income",
    amount: 100,
    currency: "UYU",
    accountId: dollarAccount,
    categoryId,
    tagIds: [],
    paymentType: "debit",
    paymentStatus: "cleared",
    exchangeRateToPrimary: 1,
    occurredAt: payment.occurredAt,
  });
  await expect(updateAccount(createDb(), dollarAccount, { currency: "USD" })).rejects.toThrow();
  expect(
    (await getWalletDataset(createDb())).accounts.find((account) => account.id === dollarAccount)!
      .currency,
  ).toBe("UYU");
});
test("unknown recurring amounts stay unknown and cycles do not precede rule start", async () => {
  await fixture.pool.query(
    "INSERT INTO recurring_debts(name,direction,currency,counterparty_name,category_id,day_of_month,is_active,started_at) VALUES('Test','payable','UYU','Test',$1,5,true,'2026-01-20')",
    [categoryId],
  );
  const generated = await generateDueRecurringDebts(createDb(), new Date("2026-02-10T12:00:00Z"));
  expect(generated).toHaveLength(1);
  expect(generated[0]!.pendingAmount).toBeUndefined();
  expect(generated[0]!.status).toBe("active");
});
test("overlapping imports across independent connections do not duplicate records or lose unique rows", async () => {
  const input = {
    type: "expense" as const,
    amount: 25,
    currency: "UYU" as const,
    accountId,
    categoryId,
    tagIds: [],
    paymentType: "debit" as const,
    paymentStatus: "cleared" as const,
    exchangeRateToPrimary: 1,
    occurredAt: "2026-02-01T09:00:00Z",
  };
  const later = { ...input, occurredAt: "2026-02-01T16:00:00Z" };
  await Promise.all([
    importWalletRecords(createDb(), [input, later]),
    importWalletRecords(createDb(), [input, input]),
  ]);
  expect((await getWalletDataset(createDb())).records).toHaveLength(2);
  expect(await importWalletRecords(createDb(), [input, later])).toHaveLength(0);
});
