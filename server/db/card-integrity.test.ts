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
  listCreditCardStatements,
  payCreditCardStatement,
  updateCreditCardRecord,
} from "./wallet-repository.js";
import {
  calculateCreditCardStatementBalance,
  calculateCreditCardSummary,
  creditCardCycleDates,
  creditCardStatementStatusAfterPaymentChange,
} from "../../shared/calculations.js";

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
    "TRUNCATE accounts, categories, credit_cards RESTART IDENTITY CASCADE",
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
