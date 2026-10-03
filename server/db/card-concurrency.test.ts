import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDb } from "./client.js";
import { accounts, categories, creditCards } from "./schema.js";
import {
  createCreditCardRecord,
  getWalletDataset,
  listCreditCardStatements,
  payCreditCardStatement,
} from "./wallet-repository.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const cardId = randomUUID(),
  categoryId = randomUUID(),
  accountId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.close();
}, 30000);
beforeEach(async () => {
  await fixture.pool.query(
    "TRUNCATE accounts, categories, credit_cards CASCADE",
  );
  const db = createDb();
  await db.insert(accounts).values({
    id: accountId,
    name: "Bank",
    type: "bank",
    currency: "UYU",
    initialBalance: "1000",
    color: "blue",
    icon: "bank",
  });
  await db
    .insert(categories)
    .values({ id: categoryId, name: "Test", color: "blue", icon: "test" });
  await db.insert(creditCards).values({
    id: cardId,
    name: "Test",
    issuer: "Test",
    lastFour: "1234",
    creditLimit: "10000",
    limitCurrency: "UYU",
    closingDay: 20,
    dueDay: 5,
    color: "blue",
    icon: "card",
    isActive: true,
  });
  await createCreditCardRecord(cardId, {
    kind: "purchase",
    amount: 100,
    currency: "UYU",
    amountInLimitCurrency: 100,
    exchangeRateToLimitCurrency: 1,
    categoryId,
    accountImpactAtCreation: false,
    occurredAt: "2020-06-01T12:00:00.000Z",
  });
});
const payment = (amount: number) => ({
  amount,
  currency: "UYU" as const,
  amountInLimitCurrency: amount,
  accountId,
  accountAmount: amount,
  occurredAt: new Date().toISOString(),
});

test("independent PostgreSQL connections cannot both pay the same full statement", async () => {
  const [statement] = await listCreditCardStatements(cardId);
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      payCreditCardStatement(cardId, statement.id, payment(100)),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const dataset = await getWalletDataset();
  expect(dataset.creditCardPayments).toHaveLength(1);
  expect(
    dataset.creditCardPaymentAllocations.reduce(
      (sum, row) => sum + row.amountInLimitCurrency,
      0,
    ),
  ).toBe(100);
  expect(dataset.creditCardStatements[0].status).toBe("paid");
});

test("independent partial payments allocate exactly the balance without overdraw", async () => {
  const [statement] = await listCreditCardStatements(cardId);
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      payCreditCardStatement(cardId, statement.id, payment(25)),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(4);
  const dataset = await getWalletDataset();
  expect(
    dataset.creditCardPayments.reduce(
      (sum, row) => sum + row.amountInLimitCurrency,
      0,
    ),
  ).toBe(100);
  expect(
    dataset.creditCardPaymentAllocations.reduce(
      (sum, row) => sum + row.amountInLimitCurrency,
      0,
    ),
  ).toBe(100);
});

test("independent refund submissions cannot refund more than the original purchase", async () => {
  const dataset = await getWalletDataset();
  const original = dataset.creditCardRecords[0];
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      createCreditCardRecord(cardId, {
        kind: "refund",
        originalRecordId: original.id,
        amount: 60,
        currency: "UYU",
        amountInLimitCurrency: 60,
        exchangeRateToLimitCurrency: 1,
        categoryId,
        accountImpactAtCreation: false,
        occurredAt: new Date().toISOString(),
      }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    (await getWalletDataset()).creditCardRecords
      .filter((row) => row.kind === "refund")
      .reduce((sum, row) => sum + row.amount, 0),
  ).toBe(60);
});

test("concurrent retries of one partial request return one durable payment", async () => {
  const [statement] = await listCreditCardStatements(cardId);
  const request = { ...payment(25), idempotencyKey: randomUUID() };
  const payments = await Promise.all(
    Array.from({ length: 6 }, () =>
      payCreditCardStatement(cardId, statement.id, request),
    ),
  );
  expect(new Set(payments.map((row) => row.id)).size).toBe(1);
  const dataset = await getWalletDataset();
  expect(dataset.creditCardPayments).toHaveLength(1);
  expect(dataset.creditCardPayments[0].amountInLimitCurrency).toBe(25);
  expect(
    dataset.creditCardPaymentAllocations.reduce(
      (sum, row) => sum + row.amountInLimitCurrency,
      0,
    ),
  ).toBe(25);
});
