import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createDb } from "./client.js";
import {
  accounts,
  categories,
  creditCards,
  creditCardRecords,
  records,
  settings,
  exchangeRates,
} from "./schema.js";
import {
  applyMigrations,
  installLocalTransport,
  LOCAL_DATABASE_URL,
} from "../../scripts/sandbox/database.js";
import {
  createCreditCardPayment,
  createCreditCardRecord,
  ensureCreditCardStatements,
  getWalletDataset,
  getWalletBackup,
  listCreditCardStatements,
  payCreditCardStatement,
  updateCreditCardRecord,
  deleteCreditCardRecord,
  createRecord,
  createRecordsBulk,
  updateRecord,
  deleteRecord,
} from "./wallet-repository.js";
import {
  calculateCreditCardStatementBalance,
  calculateCreditCardSummary,
  creditCardCycleDates,
  creditCardStatementStatusAfterPaymentChange,
  calculateAccountBalances,
  calculateAccountBalanceAtDate,
} from "../../shared/calculations.js";

import { restoreWalletBackup } from "./wallet-restore.js";
import { recordPatchSchema } from "../../shared/schemas.js";

const pg = new PGlite();
const cardId = randomUUID();
const categoryId = randomUUID();
const accountId = randomUUID();
const card = {
  id: cardId,
  name: "Test",
  issuer: "Test",
  lastFour: "1234",
  creditLimit: 10000,
  limitCurrency: "UYU" as const,
  closingDay: 20,
  dueDay: 5,
  color: "blue",
  icon: "card",
  isActive: true,
};
let restore: () => void;
beforeAll(async () => {
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  restore = installLocalTransport(pg);
  await applyMigrations(pg);
}, 30000);
afterAll(async () => {
  restore();
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(
    "TRUNCATE accounts, categories, credit_cards, settings, exchange_rates RESTART IDENTITY CASCADE",
  );
  const db = createDb();
  await db.insert(accounts).values({
    id: accountId,
    name: "Bank",
    type: "bank",
    currency: "UYU",
    initialBalance: "10000",
    color: "blue",
    icon: "bank",
  });
  await db
    .insert(categories)
    .values({ id: categoryId, name: "Test", color: "blue", icon: "test" });
  await db.insert(creditCards).values({ ...card, creditLimit: "10000" });
});
const purchase = (amount = 100, occurredAt = "2020-06-01T12:00:00.000Z") =>
  createCreditCardRecord(cardId, {
    kind: "purchase",
    amount,
    currency: "UYU",
    amountInLimitCurrency: amount,
    exchangeRateToLimitCurrency: 1,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt,
  });
const payment = (amount = 100) => ({
  amount,
  currency: "UYU" as const,
  amountInLimitCurrency: amount,
  accountId,
  accountAmount: amount,
  occurredAt: new Date().toISOString(),
});
const refund = (originalRecordId: string, amount: number) =>
  createCreditCardRecord(cardId, {
    kind: "refund",
    originalRecordId,
    amount,
    currency: "UYU",
    amountInLimitCurrency: amount,
    exchangeRateToLimitCurrency: 1,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt: new Date().toISOString(),
  });

test("refund edits cannot exceed a purchase including sibling refunds", async () => {
  const original = await purchase();
  const first = await refund(original.id, 40);
  await refund(original.id, 30);
  await expect(
    updateCreditCardRecord(cardId, first.id, {
      amount: 80,
      amountInLimitCurrency: 80,
    }),
  ).rejects.toThrow();
  expect(
    (await getWalletDataset()).creditCardRecords.find(
      (row) => row.id === first.id,
    )?.amount,
  ).toBe(40);
});
test("refunds preserve original currency and historical conversion", async () => {
  const original = await purchase();
  await expect(
    createCreditCardRecord(cardId, {
      kind: "refund",
      originalRecordId: original.id,
      amount: 100,
      currency: "USD",
      amountInLimitCurrency: 100,
      exchangeRateToLimitCurrency: 1,
      categoryId,
      accountImpactAtCreation: false,
      occurredAt: new Date().toISOString(),
    }),
  ).rejects.toThrow();
});
test("a retroactive purchase reopens a paid statement and date edits reassign its cycle", async () => {
  await purchase();
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment());
  const added = await purchase(50);
  await ensureCreditCardStatements();
  expect(
    (await listCreditCardStatements(cardId)).find(
      (row) => row.id === statement.id,
    )?.status,
  ).toBe("overdue");
  await updateCreditCardRecord(cardId, added.id, {
    occurredAt: "2020-07-01T12:00:00.000Z",
  });
  const dataset = await getWalletDataset();
  expect(
    dataset.creditCardRecords.find((row) => row.id === added.id)?.statementId,
  ).not.toBe(statement.id);
  expect(
    dataset.creditCardStatements.find((row) => row.id === statement.id)?.status,
  ).toBe("paid");
});
test("a paid purchase refund transfers its payment credit to other purchases", async () => {
  const first = await purchase();
  await purchase(100, "2020-06-02T12:00:00.000Z");
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment());
  await refund(first.id, 100);
  const dataset = await getWalletDataset();
  expect(
    calculateCreditCardStatementBalance(dataset, statement)
      .dueAmountInLimitCurrency,
  ).toBe(0);
  expect(
    calculateCreditCardStatementBalance(dataset, statement).currencyBreakdown,
  ).toEqual([]);
  await expect(
    payCreditCardStatement(cardId, statement.id, payment()),
  ).rejects.toThrow();
  expect((await getWalletDataset()).creditCardPayments).toHaveLength(1);
});
test("refund credit clears other purchase currencies on the same statement", async () => {
  const original = await createCreditCardRecord(cardId, {
    kind: "purchase",
    amount: 100,
    currency: "USD",
    amountInLimitCurrency: 4000,
    exchangeRateToLimitCurrency: 40,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt: "2020-06-01T12:00:00.000Z",
  });
  await purchase(1000, "2020-06-02T12:00:00.000Z");
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(4000));
  await createCreditCardRecord(cardId, {
    kind: "refund",
    originalRecordId: original.id,
    amount: 50,
    currency: "USD",
    amountInLimitCurrency: 2000,
    exchangeRateToLimitCurrency: 40,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt: new Date().toISOString(),
  });
  const balance = calculateCreditCardStatementBalance(
    await getWalletDataset(),
    statement,
  );
  expect(balance.dueAmountInLimitCurrency).toBe(0);
  expect(balance.currencyBreakdown).toEqual([]);
});
test("a generic card payment requires a statement before any financial write", async () => {
  await purchase();
  await expect(createCreditCardPayment(cardId, payment())).rejects.toThrow();
  expect((await getWalletDataset()).creditCardPayments).toEqual([]);
});
test("payment allocations settle debt in the purchase currency", async () => {
  await createCreditCardRecord(cardId, {
    kind: "purchase",
    amount: 100,
    currency: "USD",
    amountInLimitCurrency: 4000,
    exchangeRateToLimitCurrency: 40,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt: "2020-06-01T12:00:00.000Z",
  });
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(4000));
  const summary = calculateCreditCardSummary(await getWalletDataset(), card);
  expect(summary.usedLimit).toBe(0);
  expect(summary.outstanding).toEqual([]);
  expect(summary.statementDue).toEqual([]);
});
test("the cycle includes the complete first day after closing", () => {
  expect(
    creditCardCycleDates(
      card,
      new Date("2026-06-21T12:00:00.000Z"),
    ).currentCycleStart.toISOString(),
  ).toBe("2026-06-21T00:00:00.000Z");
});
test("a partially paid statement becomes overdue after its due date", () => {
  expect(
    creditCardStatementStatusAfterPaymentChange(
      100,
      50,
      "2020-01-01T00:00:00.000Z",
    ),
  ).toBe("overdue");
});
test("concurrent statement payments debit the bank only once", async () => {
  await purchase();
  const [statement] = await listCreditCardStatements(cardId);
  const results = await Promise.allSettled([
    payCreditCardStatement(cardId, statement.id, payment()),
    payCreditCardStatement(cardId, statement.id, payment()),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect((await getWalletDataset()).creditCardPayments).toHaveLength(1);
});
test("a failed payment rolls back its allocations and statement status", async () => {
  await purchase();
  const [statement] = await listCreditCardStatements(cardId);
  await expect(
    payCreditCardStatement(cardId, statement.id, {
      ...payment(),
      accountId: randomUUID(),
    }),
  ).rejects.toThrow();
  const dataset = await getWalletDataset();
  expect(dataset.creditCardPayments).toHaveLength(0);
  expect(dataset.creditCardPaymentAllocations).toHaveLength(0);
  expect(dataset.creditCardStatements[0].status).toBe("overdue");
});
test("a partial payment retry returns the original payment and rejects changed payloads", async () => {
  await purchase();
  const [statement] = await listCreditCardStatements(cardId);
  const request = { ...payment(25), idempotencyKey: randomUUID() };
  const first = await payCreditCardStatement(cardId, statement.id, request);
  const retry = await payCreditCardStatement(cardId, statement.id, request);
  expect(retry.id).toBe(first.id);
  await expect(
    payCreditCardStatement(cardId, statement.id, {
      ...request,
      amount: 30,
      amountInLimitCurrency: 30,
    }),
  ).rejects.toThrow();
  expect((await getWalletDataset()).creditCardPayments).toHaveLength(1);
});
test("a calculated foreign-currency amount is rounded by PostgreSQL to persisted precision", async () => {
  const movement = await createCreditCardRecord(cardId, {
    kind: "purchase",
    amount: 44.6,
    currency: "USD",
    amountInLimitCurrency: 44.6 * 1.071736,
    exchangeRateToLimitCurrency: 1.071736,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt: "2020-06-01T12:00:00.000Z",
  });
  expect(movement.amountInLimitCurrency).toBe(47.8);
});

test("deleting a purchase cannot orphan its refund or payment history", async () => {
  const original = await purchase();
  await refund(original.id, 20);
  await expect(deleteCreditCardRecord(cardId, original.id)).rejects.toThrow();
  const second = await purchase(50);
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(130));
  await expect(deleteCreditCardRecord(cardId, second.id)).rejects.toThrow();
  expect((await getWalletDataset()).creditCardRecords.filter(row => row.kind === "purchase")).toHaveLength(2);
});

test("a paid linked purchase refund cannot credit the bank while its payment credit settles another purchase", async () => {
  await createRecord({ type: "expense", amount: 100, currency: "UYU", accountId, accountAmount: 100, creditCardId: cardId, categoryId, tagIds: [], paymentType: "credit", paymentStatus: "cleared", exchangeRateToPrimary: 1, amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, occurredAt: "2020-06-01T12:00:00.000Z" });
  const original = (await getWalletDataset()).creditCardRecords[0];
  await purchase(100, "2020-06-02T12:00:00.000Z");
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(100));
  await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  const dataset = await getWalletDataset();
  expect(calculateCreditCardStatementBalance(dataset, statement).dueAmountInLimitCurrency).toBe(0);
  expect(calculateAccountBalances(dataset).find(row => row.account.id === accountId)?.totalBalance).toBe(9900);
});

test("a paid direct purchase refund keeps its credit on the card", async () => {
  const original = await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-01T12:00:00.000Z" });
  await purchase(100, "2020-06-02T12:00:00.000Z");
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(100));
  const returned = await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  const dataset = await getWalletDataset();
  expect(returned.accountImpactAtCreation).toBe(false);
  expect(returned.accountAmount).toBeUndefined();
  expect(calculateAccountBalances(dataset).find(row => row.account.id === accountId)?.totalBalance).toBe(9900);
  expect(calculateCreditCardStatementBalance(dataset, statement).dueAmountInLimitCurrency).toBe(0);
});

test("a partially paid linked refund restores only the unpaid bank reservation", async () => {
  await createRecord({ type: "expense", amount: 100, currency: "UYU", accountId, accountAmount: 100, creditCardId: cardId, categoryId, tagIds: [], paymentType: "credit", paymentStatus: "cleared", exchangeRateToPrimary: 1, amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, occurredAt: "2020-06-01T12:00:00.000Z" });
  const original = (await getWalletDataset()).creditCardRecords[0];
  await purchase(100, "2020-06-02T12:00:00.000Z");
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(40));
  const returned = await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  const dataset = await getWalletDataset();
  expect(returned.accountAmount).toBe(60);
  expect(dataset.records.find(row => row.type === "income")?.amount).toBe(60);
  expect(calculateAccountBalances(dataset).find(row => row.account.id === accountId)?.totalBalance).toBe(9960);
  expect(calculateCreditCardStatementBalance(dataset, statement).dueAmountInLimitCurrency).toBe(60);
  await payCreditCardStatement(cardId, statement.id, payment(60));
  expect(calculateAccountBalances(await getWalletDataset()).find(row => row.account.id === accountId)?.totalBalance).toBe(9900);
});

test("the final partial bank refund returns the remaining cent", async () => {
  const original = await createCreditCardRecord(cardId, { kind: "purchase", amount: 3, currency: "UYU", amountInLimitCurrency: 3, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 1, accountImpactAtCreation: true, occurredAt: "2020-06-01T12:00:00.000Z" });
  const amounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const returned = await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 1, currency: "UYU", amountInLimitCurrency: 1, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 0.33, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
    amounts.push(returned.accountAmount!);
  }
  expect(amounts).toEqual([0.33, 0.33, 0.34]);
  expect(calculateAccountBalances(await getWalletDataset()).find(row => row.account.id === accountId)?.totalBalance).toBe(10000);
});

test("editing a direct bank refund recomputes its authoritative bank amount", async () => {
  const original = await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-01T12:00:00.000Z" });
  const returned = await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  const edited = await updateCreditCardRecord(cardId, returned.id, { amount: 50, amountInLimitCurrency: 50, accountAmount: 200 });
  expect(edited?.accountAmount).toBe(50);
  expect(calculateAccountBalances(await getWalletDataset()).find(row => row.account.id === accountId)?.totalBalance).toBe(9950);
});

test("a fully paid foreign-currency refund needs no bank quote because it remains card credit", async () => {
  await createDb().insert(settings).values({ primaryCurrency: "USD" });
  await createRecord({ type: "expense", amount: 100, currency: "USD", accountId, accountAmount: 4000, creditCardId: cardId, categoryId, tagIds: [], paymentType: "credit", paymentStatus: "cleared", exchangeRateToPrimary: 1, amountInLimitCurrency: 4000, exchangeRateToLimitCurrency: 40, occurredAt: "2020-06-01T12:00:00.000Z" });
  const original = (await getWalletDataset()).creditCardRecords[0];
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(4000));
  const returned = await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "USD", amountInLimitCurrency: 4000, exchangeRateToLimitCurrency: 40, categoryId, accountId, accountAmount: 4000, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  expect(returned.walletRecordId).toBeUndefined();
  expect(returned.accountImpactAtCreation).toBe(false);
  expect((await getWalletDataset()).records.filter(row => row.type === "income")).toHaveLength(0);
});

test("reused payment credit releases the other purchase's reservation in its own bank account", async () => {
  const otherAccountId = randomUUID();
  await createDb().insert(accounts).values({ id: otherAccountId, name: "Other bank", type: "bank", currency: "UYU", initialBalance: "10000", color: "blue", icon: "bank" });
  const original = await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-01T12:00:00.000Z" });
  await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId: otherAccountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-02T12:00:00.000Z" });
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(100));
  await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  const balances = calculateAccountBalances(await getWalletDataset());
  expect(balances.find(row => row.account.id === accountId)?.totalBalance).toBe(9900);
  expect(balances.find(row => row.account.id === otherAccountId)?.totalBalance).toBe(10000);
});
test("reservation release excludes future refunds and payments from historical balances", async () => {
  const otherAccountId = randomUUID();
  await createDb().insert(accounts).values({ id: otherAccountId, name: "Other bank", type: "bank", currency: "UYU", initialBalance: "10000", color: "blue", icon: "bank" });
  const original = await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-01T12:00:00.000Z" });
  await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId: otherAccountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-02T12:00:00.000Z" });
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, { ...payment(40), occurredAt: "2020-07-01T12:00:00.000Z" });
  await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-07-10T12:00:00.000Z" });
  await payCreditCardStatement(cardId, statement.id, { ...payment(60), occurredAt: "2020-07-20T12:00:00.000Z" });
  const dataset = await getWalletDataset();
  expect(calculateAccountBalanceAtDate(dataset, accountId, "2020-07-05")).toBe(9900);
  expect(calculateAccountBalanceAtDate(dataset, otherAccountId, "2020-07-05")).toBe(9900);
  expect(calculateAccountBalanceAtDate(dataset, accountId, "2020-07-10")).toBe(9960);
  expect(calculateAccountBalanceAtDate(dataset, otherAccountId, "2020-07-10")).toBe(9940);
  expect(calculateAccountBalanceAtDate(dataset, otherAccountId, "2020-07-20")).toBe(9940);
  expect(calculateAccountBalances(dataset).find(row => row.account.id === otherAccountId)?.totalBalance).toBe(9940);
});

test("releasing part of a bank reservation preserves its rounding remainder", async () => {
  const otherAccountId = randomUUID();
  await createDb().insert(accounts).values({ id: otherAccountId, name: "Other bank", type: "bank", currency: "UYU", initialBalance: "10000", color: "blue", icon: "bank" });
  const original = await createCreditCardRecord(cardId, { kind: "purchase", amount: 1, currency: "UYU", amountInLimitCurrency: 1, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 1, accountImpactAtCreation: true, occurredAt: "2020-06-01T12:00:00.000Z" });
  const [statement] = await listCreditCardStatements(cardId);
  await payCreditCardStatement(cardId, statement.id, payment(1));
  await createCreditCardRecord(cardId, { kind: "purchase", amount: 3, currency: "UYU", amountInLimitCurrency: 3, exchangeRateToLimitCurrency: 1, categoryId, accountId: otherAccountId, accountAmount: 1, accountImpactAtCreation: true, occurredAt: "2020-06-02T12:00:00.000Z" });
  await payCreditCardStatement(cardId, statement.id, { ...payment(1), accountId: otherAccountId });
  await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 1, currency: "UYU", amountInLimitCurrency: 1, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 1, accountImpactAtCreation: true, occurredAt: new Date().toISOString() });
  // Of the bank's 1.00 debit: .33 is settled, .33 is still reserved, .34 is released.
  expect(calculateAccountBalances(await getWalletDataset()).find(row => row.account.id === otherAccountId)?.totalBalance).toBe(9999.34);
});

test("a bank refund uses the account-to-primary quote instead of an invented 1:1 rate", async () => {
  const db = createDb();
  await db.insert(settings).values({ primaryCurrency: "USD" });
  await db.insert(exchangeRates).values({
    fromCurrency: "USD",
    toCurrency: "UYU",
    rate: "40",
    date: new Date("2020-01-01T00:00:00.000Z"),
  });
  const walletRecordId = randomUUID();
  await db.insert(records).values({
    id: walletRecordId,
    type: "expense",
    amount: "100",
    currency: "USD",
    accountId,
    accountAmount: "4000",
    creditCardId: cardId,
    categoryId,
    paymentType: "credit",
    paymentStatus: "cleared",
    exchangeRateToPrimary: "1",
    occurredAt: new Date("2020-06-01T12:00:00.000Z"),
  });
  const original = await createCreditCardRecord(cardId, {
    kind: "purchase",
    amount: 100,
    currency: "USD",
    amountInLimitCurrency: 4000,
    exchangeRateToLimitCurrency: 40,
    categoryId,
    accountId,
    accountAmount: 4000,
    accountImpactAtCreation: true,
    occurredAt: "2020-06-01T12:00:00.000Z",
  });
  await db.update(creditCardRecords).set({ walletRecordId });
  await createCreditCardRecord(cardId, {
    kind: "refund",
    originalRecordId: original.id,
    amount: 100,
    currency: "USD",
    amountInLimitCurrency: 4000,
    exchangeRateToLimitCurrency: 40,
    categoryId,
    accountId,
    accountAmount: 4000,
    accountImpactAtCreation: true,
    occurredAt: new Date().toISOString(),
  });
  const dataset = await getWalletDataset();
  const bankRefund = dataset.records.find((row) => row.type === "income");
  expect(bankRefund).toMatchObject({
    amount: 4000,
    currency: "UYU",
    exchangeRateToPrimary: 0.025,
  });
});


const linkedPurchaseInput = (paymentStatus: "cleared" | "cancelled" | "needs_review" = "cleared") => ({
  type: "expense" as const, amount: 100, currency: "UYU" as const, accountId, accountAmount: 100,
  creditCardId: cardId, categoryId, tagIds: [], paymentType: "credit" as const, paymentStatus,
  exchangeRateToPrimary: 1, amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1,
  occurredAt: "2020-06-01T12:00:00.000Z",
});

test.each(["refund", "payment"] as const)("linked purchase mutations preserve %s dependencies", async dependency => {
  const wallet = await createRecord(linkedPurchaseInput());
  const dataset = await getWalletDataset();
  const original = dataset.creditCardRecords.find(row => row.walletRecordId === wallet.id)!;
  const otherCardId = randomUUID();
  await createDb().insert(creditCards).values({ ...card, id: otherCardId, creditLimit: "10000" });
  if (dependency === "refund") await refund(original.id, 40);
  else await payCreditCardStatement(cardId, dataset.creditCardStatements[0].id, payment(40));
  for (const patch of [
    { paymentStatus: "cancelled" as const },
    { creditCardId: undefined }, { creditCardId: otherCardId }, { type: "income" as const },
  ]) await expect(updateRecord(wallet.id, patch)).rejects.toThrow();
  await expect(deleteRecord(wallet.id)).rejects.toThrow();
  const after = await getWalletDataset();
  expect(after.records.find(row => row.id === wallet.id)?.paymentStatus).toBe("cleared");
  expect(after.creditCardRecords.find(row => row.id === original.id)?.creditCardId).toBe(cardId);
  await updateRecord(wallet.id, { paymentStatus: "needs_review" });
  const reviewed = await getWalletDataset();
  expect(reviewed.records.find(row=>row.id===wallet.id)?.paymentStatus).toBe("needs_review");
  expect(reviewed.creditCardRecords.find(row=>row.id===original.id)?.amountInLimitCurrency).toBe(100);
});

test("linked purchase edits enforce refund amount and currency constraints", async () => {
  const wallet = await createRecord(linkedPurchaseInput());
  const original = (await getWalletDataset()).creditCardRecords.find(row => row.walletRecordId === wallet.id)!;
  await refund(original.id, 60);
  await expect(updateRecord(wallet.id, { amount: 50, amountInLimitCurrency: 50, accountAmount: 50 })).rejects.toThrow();
  await expect(updateRecord(wallet.id, { currency: "USD", amount: 100, amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1 })).rejects.toThrow();
  await expect(updateRecord(wallet.id, { amount: 100, amountInLimitCurrency: 50, exchangeRateToLimitCurrency: 0.5 })).rejects.toThrow();
  await updateRecord(wallet.id, { note: "Purchase verified" });
  expect((await getWalletDataset()).creditCardRecords.find(row => row.id === original.id)?.amount).toBe(100);
});

test("cancelled creates no active linked card liability through single or bulk creation", async () => {
  const status = "cancelled";
  const single = await createRecord(linkedPurchaseInput(status));
  const [bulk] = await createRecordsBulk([linkedPurchaseInput(status)]);
  expect((await getWalletDataset()).creditCardRecords).toHaveLength(0);
  await updateRecord(single.id, { paymentStatus: "cleared" });
  await updateRecord(bulk.id, { paymentStatus: "cleared" });
  expect((await getWalletDataset()).creditCardRecords.filter(row => row.kind === "purchase")).toHaveLength(2);
});

test("review purchases preserve linked liability through single and bulk creation and clearing",async()=>{
  const single=await createRecord(linkedPurchaseInput("needs_review"));
  const [bulk]=await createRecordsBulk([linkedPurchaseInput("needs_review")]);
  const reviewed=await getWalletDataset();
  expect(reviewed.creditCardRecords.filter(row=>row.kind==="purchase")).toHaveLength(2);
  expect(calculateCreditCardSummary(reviewed,reviewed.creditCards.find(row=>row.id===cardId)!).usedLimit).toBe(200);
  await updateRecord(single.id,{paymentStatus:"cleared"});
  await updateRecord(bulk.id,{paymentStatus:"cleared"});
  const cleared=await getWalletDataset();
  expect(cleared.creditCardRecords).toHaveLength(2);
  expect(calculateCreditCardSummary(cleared,cleared.creditCards.find(row=>row.id===cardId)!).usedLimit).toBe(200);
});

test("clearing a card-only review purchase preserves its wallet history and reporting amount",async()=>{
  const wallet=await createRecord({...linkedPurchaseInput("needs_review"),accountId:undefined,accountAmount:undefined});
  const before=await getWalletDataset();
  const movement=before.creditCardRecords.find(row=>row.walletRecordId===wallet.id)!;
  await updateRecord(wallet.id,{paymentStatus:"cleared"});
  const after=await getWalletDataset();
  expect(after.records.find(row=>row.id===wallet.id)).toMatchObject({paymentStatus:"cleared",amount:100});
  expect(after.creditCardRecords.find(row=>row.id===movement.id)?.walletRecordId).toBe(wallet.id);
});

test("unknown original primary FX cannot produce a cleared bank refund unless a dated quote resolves it",async()=>{
  await createDb().insert(settings).values({primaryCurrency:"USD"});
  const wallet=await createRecord({...linkedPurchaseInput("needs_review"),exchangeRateToPrimary:0});
  const original=(await getWalletDataset()).creditCardRecords.find(row=>row.walletRecordId===wallet.id)!;
  await expect(refund(original.id,20)).rejects.toThrow();
  const rejected=await getWalletDataset();
  expect(rejected.records).toHaveLength(1);
  expect(rejected.creditCardRecords).toHaveLength(1);
  expect(calculateAccountBalances(rejected).find(row=>row.account.id===accountId)!.totalBalance).toBe(9900);
  await createDb().insert(exchangeRates).values({fromCurrency:"UYU",toCurrency:"USD",rate:"0.025",date:new Date("2020-01-01T00:00:00Z")});
  await refund(original.id,20);
  const resolved=await getWalletDataset();
  expect(resolved.records.find(row=>row.type==="income")).toMatchObject({paymentStatus:"cleared",amount:20,currency:"UYU",exchangeRateToPrimary:0.025});
  expect(calculateAccountBalances(resolved).find(row=>row.account.id===accountId)!.totalBalance).toBe(9920);
});

test("an unencumbered linked purchase can be cancelled, reviewed, and restored", async () => {
  const wallet = await createRecord(linkedPurchaseInput());
  await updateRecord(wallet.id, { paymentStatus: "cancelled" });
  expect((await getWalletDataset()).creditCardRecords).toHaveLength(0);
  await updateRecord(wallet.id, { paymentStatus: "needs_review" });
  expect((await getWalletDataset()).creditCardRecords).toHaveLength(1);
  await updateRecord(wallet.id, { paymentStatus: "cleared" });
  expect((await getWalletDataset()).creditCardRecords).toHaveLength(1);
});


test.each(["income", "transfer"] as const)("generic %s cannot bypass the Cards refund action", async type => {
  const destinationAccountId = randomUUID();
  await createDb().insert(accounts).values({ id: destinationAccountId, name: "Other bank", type: "bank", currency: "UYU", initialBalance: "10000", color: "blue", icon: "bank" });
  const invalid = { ...linkedPurchaseInput(), type, destinationAccountId: type === "transfer" ? destinationAccountId : undefined };
  await expect(createRecord(invalid)).rejects.toThrow(/Cards.*refund/i);
  await expect(createRecordsBulk([linkedPurchaseInput(), invalid])).rejects.toThrow(/Cards.*refund/i);
  const after = await getWalletDataset();
  expect(after.records).toHaveLength(0);
  expect(after.creditCardRecords).toHaveLength(0);
});

test("JSON null detaches an unencumbered purchase from its card", async () => {
  const wallet = await createRecord(linkedPurchaseInput());
  const patch = recordPatchSchema.parse(JSON.parse('{"creditCardId":null,"paymentType":"debit"}'));
  await updateRecord(wallet.id, patch);
  const after = await getWalletDataset();
  expect(after.records.find(row => row.id === wallet.id)?.creditCardId).toBeUndefined();
  expect(after.creditCardRecords).toHaveLength(0);
});

test("legacy income with a card association remains restorable through JSON backup", async () => {
  const walletId = randomUUID();
  const movementId = randomUUID();
  await createDb().insert(records).values({ id: walletId, type: "income", amount: "20", currency: "UYU", accountId, creditCardId: cardId, categoryId, paymentType: "credit", paymentStatus: "cleared", exchangeRateToPrimary: "1", amountInLimitCurrency: "20", exchangeRateToLimitCurrency: "1", occurredAt: new Date("2020-06-01T12:00:00.000Z") });
  await createDb().insert(creditCardRecords).values({ id: movementId, walletRecordId: walletId, creditCardId: cardId, kind: "refund", amount: "20", currency: "UYU", categoryId, amountInLimitCurrency: "20", exchangeRateToLimitCurrency: "1", accountImpactAtCreation: false, occurredAt: new Date("2020-06-01T12:00:00.000Z") });
  await restoreWalletBackup(await getWalletBackup());
  const after = await getWalletDataset();
  expect(after.records.find(row => row.id === walletId)?.type).toBe("income");
  expect(after.creditCardRecords.find(row => row.id === movementId)?.kind).toBe("refund");
});


test("linked refund bank history rejects generic financial changes but permits notes", async () => {
  const wallet = await createRecord(linkedPurchaseInput());
  const original = (await getWalletDataset()).creditCardRecords.find(row => row.walletRecordId === wallet.id)!;
  const returned = await refund(original.id, 20);
  const otherCardId = randomUUID();
  await createDb().insert(creditCards).values({ ...card, id: otherCardId, creditLimit: "10000" });
  for (const patch of [
    { amount: 200, accountAmount: 200, amountInLimitCurrency: 200 },
    { paymentStatus: "cancelled" as const },
    { creditCardId: null }, { creditCardId: otherCardId }, { type: "expense" as const },
  ]) await expect(updateRecord(returned.walletRecordId!, patch)).rejects.toThrow();
  await expect(deleteRecord(returned.walletRecordId!)).rejects.toThrow();
  await updateRecord(returned.walletRecordId!, { note: "Confirmed refund" });
  const after = await getWalletDataset();
  expect(after.creditCardRecords.find(row => row.id === returned.id)).toMatchObject({ originalRecordId: original.id, kind: "refund", amount: 20, note: "Confirmed refund" });
  expect(after.records.find(row => row.id === returned.walletRecordId)).toMatchObject({ amount: 20, paymentStatus: "cleared" });
  await updateRecord(returned.walletRecordId!,{paymentStatus:"needs_review"});
  const reviewed=await getWalletDataset();
  expect(reviewed.records.find(row=>row.id===returned.walletRecordId)).toMatchObject({amount:20,paymentStatus:"needs_review"});
  expect(reviewed.creditCardRecords.find(row=>row.id===returned.id)).toMatchObject({kind:"refund",amount:20});
});

test("foreign linked refund metadata keeps card-native and bank amounts distinct", async () => {
  const wallet = await createRecord({ ...linkedPurchaseInput(), amount: 100, currency: "USD", accountAmount: 4000, amountInLimitCurrency: 4000, exchangeRateToLimitCurrency: 40, exchangeRateToPrimary: 40 });
  const original = (await getWalletDataset()).creditCardRecords.find(row => row.walletRecordId === wallet.id)!;
  const returned = await createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 20, currency: "USD", amountInLimitCurrency: 800, exchangeRateToLimitCurrency: 40, categoryId, accountImpactAtCreation: false, occurredAt: new Date().toISOString() });
  await updateRecord(returned.walletRecordId!, { note: "Verified foreign refund" });
  const after = await getWalletDataset();
  expect(after.creditCardRecords.find(row => row.id === returned.id)).toMatchObject({ originalRecordId: original.id, amount: 20, currency: "USD", accountAmount: 800, note: "Verified foreign refund" });
  expect(after.records.find(row => row.id === returned.walletRecordId)).toMatchObject({ amount: 800, currency: "UYU" });
});


test("generic card purchase creation checks native-to-limit conversion atomically", async () => {
  const invalid = { ...linkedPurchaseInput(), amountInLimitCurrency: 1 };
  await expect(createRecord(invalid)).rejects.toThrow();
  await expect(createRecordsBulk([linkedPurchaseInput(), invalid])).rejects.toThrow();
  const after = await getWalletDataset();
  expect(after.records).toHaveLength(0);
  expect(after.creditCardRecords).toHaveLength(0);
});

test.each(["refund", "payment"] as const)("a purchase bank source remains durable after %s", async dependency => {
  const wallet = await createRecord(linkedPurchaseInput());
  const dataset = await getWalletDataset();
  const original = dataset.creditCardRecords.find(row => row.walletRecordId === wallet.id)!;
  if (dependency === "refund") await refund(original.id, 20);
  else await payCreditCardStatement(cardId, dataset.creditCardStatements[0].id, payment(20));
  await expect(updateRecord(wallet.id, { accountAmount: 10 })).rejects.toThrow();
  await expect(updateCreditCardRecord(cardId, original.id, { accountAmount: 10 })).resolves.toBeNull();
  const direct = await createCreditCardRecord(cardId, { kind: "purchase", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 100, accountImpactAtCreation: true, occurredAt: "2020-06-02T12:00:00.000Z" });
  if (dependency === "refund") await refund(direct.id, 20);
  else await payCreditCardStatement(cardId, dataset.creditCardStatements[0].id, payment(100));
  await expect(updateCreditCardRecord(cardId, direct.id, { accountAmount: 10 })).rejects.toThrow();
  await expect(updateCreditCardRecord(cardId, direct.id, { accountImpactAtCreation: false })).rejects.toThrow();
  expect((await getWalletDataset()).creditCardRecords.find(row => row.id === original.id)?.accountAmount).toBe(100);
});
