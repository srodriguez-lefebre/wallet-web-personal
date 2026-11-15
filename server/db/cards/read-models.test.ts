import { randomUUID } from "node:crypto";

import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../../scripts/sandbox/postgres-test.js";
import { calculateCreditCardCategoryUsage } from "../../../shared/cards.js";
import { selectPendingCardStatements } from "../../../src/lib/cards-presentation.js";
import { createDb } from "../client.js";
import { getWalletDataset } from "../dataset.js";
import { getCardCategoryUsage, getCardLedger, getCardStatementAgenda } from "./read-models.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const card = randomUUID(),
  archived = randomUUID(),
  statement = randomUUID(),
  archivedStatement = randomUUID(),
  futureStatement = randomUUID();
const root = randomUUID(),
  child = randomUUID(),
  other = randomUUID(),
  bank = randomUUID();
const purchase = randomUUID(),
  second = randomUUID(),
  linked = randomUUID(),
  payment = randomUUID(),
  deletedPayment = randomUUID();
const now = new Date("2026-11-14T12:00:00Z");
beforeAll(async () => {
  vi.stubEnv("TZ", "America/Montevideo");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic card bank','bank','UYU',10000,'blue','bank')",
    [bank],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic root','blue','tag'),($2,'Synthetic second root','red','tag')",
    [root, other],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,parent_id,color,icon) VALUES($1,'Synthetic child',$2,'blue','tag')",
    [child, root],
  );
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon,is_active) VALUES($1,'Synthetic active','Bank','1234',1000,'USD',31,15,'blue','card',true),($2,'Synthetic archived','Bank','9876',1000,'USD',31,10,'red','card',false)",
    [card, archived],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_statements(id,credit_card_id,cycle_start,cycle_end,due_at,closed_at,status) VALUES($1,$2,'2026-10-01','2026-10-31','2026-11-15T01:00:00Z','2026-10-31','paid'),($3,$4,'2026-10-01','2026-10-31','2026-11-10','2026-10-31','pending'),($5,$2,'2026-11-01','2026-11-30','2026-12-15','2026-11-30','pending')",
    [statement, card, archivedStatement, archived, futureStatement],
  );
  await fixture.pool.query(
    "INSERT INTO records(id,type,amount,currency,credit_card_id,account_id,account_amount,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',100,'USD',$2,$3,4000,$4,'credit','cleared',40,'2026-10-10')",
    [linked, card, bank, child],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(id,credit_card_id,wallet_record_id,statement_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at) VALUES($1,$2,$3,$4,'purchase',100,'USD',100,1,$5,'2026-10-10'),($6,$2,NULL,$4,'purchase',50,'EUR',100,2,$7,'2026-10-11')",
    [purchase, card, linked, statement, child, second, other],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,statement_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at,deleted_at) VALUES($1,$2,'purchase',40,'USD',40,1,$3,'2026-10-12',NULL),($4,$5,'purchase',7,'USD',7,1,$3,'2026-10-29',NULL),($4,$5,'purchase',99,'USD',99,1,$3,'2026-11-20',NULL),($4,$5,'purchase',777,'USD',777,1,$3,'2026-10-13',now())",
    [archived, archivedStatement, root, card, futureStatement],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,kind,original_record_id,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at) VALUES($1,'refund',$2,20,'USD',20,1,$3,'2026-11-01')",
    [card, purchase, child],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_payments(id,credit_card_id,statement_id,amount,currency,amount_in_limit_currency,occurred_at,deleted_at) VALUES($1,$2,$3,50,'USD',50,'2026-11-02',NULL),($4,$2,$3,999,'USD',999,'2026-11-03',now()),($5,$2,$3,30,'USD',30,'2026-11-20',NULL)",
    [payment, card, statement, deletedPayment, randomUUID()],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_payment_allocations(payment_id,credit_card_record_id,amount,amount_in_limit_currency) VALUES($1,$2,50,50),($3,$2,999,999)",
    [payment, purchase, deletedPayment],
  );
  await fixture.pool.query(
    "INSERT INTO records(type,amount,currency,credit_card_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,deleted_at) VALUES('expense',10,'USD',$1,NULL,'credit','cleared',40,'2026-10-14',NULL),('income',5,'USD',$1,NULL,'credit','cleared',40,'2026-11-01',NULL),('expense',15,'BRL',$1,$2,'credit','needs_review',0,'2026-10-15',NULL),('expense',999,'USD',$1,$2,'credit','cancelled',40,'2026-10-16',NULL),('expense',888,'USD',$1,$2,'credit','cleared',40,'2026-10-16',now())",
    [card, child],
  );
}, 60_000);
afterAll(async () => {
  await fixture?.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
test("statement agenda preserves FIFO, viewer dates, archived cards and ignores future payments or stale status", async () => {
  const data = await getWalletDataset(createDb());
  const actual = await getCardStatementAgenda(createDb(), { timeZone: "America/Montevideo" }, now);
  expect(actual).toEqual(selectPendingCardStatements(data, now));
  expect(actual.find((row) => row.statement.id === statement)).toMatchObject({
    dueAmountInLimitCurrency: 130,
    daysUntilDue: 0,
    urgency: "today",
    currencyBreakdown: [
      { currency: "EUR", amount: 50 },
      { currency: "USD", amount: 30 },
    ],
  });
  expect(actual.some((row) => row.card.id === archived)).toBe(true);
  expect(actual.some((row) => row.statement.id === futureStatement)).toBe(false);
});
test("agenda derives calendar days in the requested timezone", async () => {
  vi.stubEnv("TZ", "Europe/Paris");
  try {
    const data = await getWalletDataset(createDb());
    const actual = await getCardStatementAgenda(createDb(), { timeZone: "Europe/Paris" }, now);
    expect(actual).toEqual(selectPendingCardStatements(data, now));
    expect(actual.find((row) => row.statement.id === statement)?.daysUntilDue).toBe(1);
  } finally {
    vi.stubEnv("TZ", "America/Montevideo");
  }
});
test("category usage retains root descendants, legacy wallet movements, uncategorized share and frozen card values", async () => {
  const data = await getWalletDataset(createDb());
  for (const item of data.creditCards) {
    const expected = calculateCreditCardCategoryUsage(data, item, now),
      actual = await getCardCategoryUsage(createDb(), item.id, now);
    expect(actual.map((row) => row.id).sort()).toEqual(expected.map((row) => row.id).sort());
    for (const row of expected)
      expect(actual.find((value) => value.id === row.id)?.amount).toBeCloseTo(row.amount, 10);
  }
});
test("one read-only ledger batch only sends this card's active history and allocations of active payments", async () => {
  const data = await getWalletDataset(createDb());
  let calls = 0;
  const previous = neonConfig.fetchFunction!;
  neonConfig.fetchFunction = (input: string, init: RequestInit) => {
    calls++;
    return previous(input, init);
  };
  try {
    const ledger = await getCardLedger(createDb(), card);
    expect(calls).toBe(1);
    expect(ledger).not.toHaveProperty("records");
    expect(ledger.creditCardRecords.map((row) => row.id).sort()).toEqual(
      data.creditCardRecords
        .filter((row) => row.creditCardId === card)
        .map((row) => row.id)
        .sort(),
    );
    expect(ledger.creditCardPayments.map((row) => row.id).sort()).toEqual(
      data.creditCardPayments
        .filter((row) => row.creditCardId === card)
        .map((row) => row.id)
        .sort(),
    );
    expect(ledger.creditCardStatements.map((row) => row.id).sort()).toEqual(
      data.creditCardStatements
        .filter((row) => row.creditCardId === card)
        .map((row) => row.id)
        .sort(),
    );
    expect(ledger.creditCardPaymentAllocations).toHaveLength(1);
    expect(ledger.creditCardPaymentAllocations[0]?.paymentId).toBe(payment);
  } finally {
    neonConfig.fetchFunction = previous;
  }
});
