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
  deleteCreditCardRecord,
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

test("deletion waits for an in-flight refund and cannot hide its purchase", async () => {
  const original = (await getWalletDataset()).creditCardRecords[0];
  await fixture.pool.query(`CREATE FUNCTION delay_test_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.kind = 'refund' THEN PERFORM pg_sleep(0.25); END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER delay_test_refund BEFORE INSERT ON credit_card_records FOR EACH ROW EXECUTE FUNCTION delay_test_refund()`);
  try {
    const refund = createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 60, currency: "UYU", amountInLimitCurrency: 60, exchangeRateToLimitCurrency: 1, categoryId, accountImpactAtCreation: false, occurredAt: new Date().toISOString() });
    const deadline = Date.now() + 5000;
    let refundIsInserting = false;
    while (Date.now() < deadline) {
      const active = await fixture.pool.query("SELECT pid FROM pg_stat_activity WHERE wait_event = 'PgSleep' AND query ILIKE '%credit_card_records%'");
      if (active.rows.length) { refundIsInserting = true; break; }
    }
    expect(refundIsInserting).toBe(true);
    const deletion = deleteCreditCardRecord(cardId, original.id);
    const results = await Promise.allSettled([refund, deletion]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect((await getWalletDataset()).creditCardRecords).toHaveLength(2);
  } finally {
    await fixture.pool.query("DROP TRIGGER delay_test_refund ON credit_card_records; DROP FUNCTION delay_test_refund()");
  }
});


test("a refund rejects a purchase whose bank data changed before acquiring the card lock", async () => {
  const original = (await getWalletDataset()).creditCardRecords[0];
  await fixture.pool.query("UPDATE credit_card_records SET account_impact_at_creation=true, account_id=$2, account_amount=100 WHERE id=$1", [original.id, accountId]);
  const otherAccountId = randomUUID();
  await createDb().insert(accounts).values({ id: otherAccountId, name: "Other", type: "bank", currency: "UYU", initialBalance: "1000", color: "blue", icon: "bank" });
  const holder = await fixture.pool.connect();
  let committed = false;
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM credit_cards WHERE id=$1 FOR UPDATE", [cardId]);
    const refund = createCreditCardRecord(cardId, { kind: "refund", originalRecordId: original.id, amount: 60, currency: "UYU", amountInLimitCurrency: 60, exchangeRateToLimitCurrency: 1, categoryId, accountId, accountAmount: 60, accountImpactAtCreation: true, occurredAt: new Date().toISOString() }).then(value => ({ value }), error => ({ error }));
    const deadline = Date.now() + 5000;
    let waitingForCard = false;
    while (Date.now() < deadline) {
      const waiting = await fixture.pool.query("SELECT pid FROM pg_stat_activity WHERE wait_event = 'transactionid' AND query ILIKE '%credit_cards%'");
      if (waiting.rows.length) { waitingForCard = true; break; }
    }
    expect(waitingForCard).toBe(true);
    await holder.query("UPDATE credit_card_records SET account_id=$2 WHERE id=$1", [original.id, otherAccountId]);
    await holder.query("COMMIT");
    committed = true;
    expect(await refund).toHaveProperty("error");
    expect((await getWalletDataset()).creditCardRecords.filter(row => row.kind === "refund")).toHaveLength(0);
  } finally {
    if (!committed) await holder.query("ROLLBACK");
    holder.release();
  }
});
