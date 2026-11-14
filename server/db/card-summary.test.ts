import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { calculateCreditCardSummary } from "../../shared/calculations.js";
import { getCreditCardSummary } from "./cards/summary.js";
import { createDb } from "./client.js";
import { getWalletDataset } from "./dataset.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const cardId = randomUUID(),
  categoryId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Synthetic card','Synthetic bank','1234',10000,'UYU',20,5,'blue','card')",
    [cardId],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic category','blue','tag')",
    [categoryId],
  );
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});
test("SQL summary preserves legacy, dated, allocated, refunded and mixed-currency semantics", async () => {
  const old = randomUUID(),
    other = randomUUID(),
    statement = randomUUID();
  await fixture.pool.query(
    "INSERT INTO credit_card_statements(id,credit_card_id,cycle_start,cycle_end,due_at,closed_at) VALUES($1,$2,'2026-01-21','2026-02-20T23:59:59.999Z','2026-03-05T23:59:59.999Z','2026-02-20T23:59:59.999Z')",
    [statement, cardId],
  );
  await fixture.pool.query(
    `INSERT INTO credit_card_records(id,credit_card_id,statement_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at) VALUES
  ($1,$3,$5,'purchase',10,'USD',400,40,$4,'2026-02-01'),($2,$3,$5,'purchase',300,'UYU',300,1,$4,'2026-02-02')`,
    [old, other, cardId, categoryId, statement],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,original_record_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at) VALUES($1,$2,'refund',2,'USD',80,40,$3,'2026-03-01'),($1,NULL,'refund',20,'UYU',20,1,$3,'2026-03-02'),($1,NULL,'purchase',900,'UYU',900,1,$3,'2027-01-01')",
    [cardId, old, categoryId],
  );
  const payment = randomUUID();
  await fixture.pool.query(
    "INSERT INTO credit_card_payments(id,credit_card_id,statement_id,amount,currency,amount_in_limit_currency,occurred_at) VALUES($1,$2,$3,200,'UYU',200,'2026-03-01')",
    [payment, cardId, statement],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_payment_allocations(payment_id,credit_card_record_id,amount,amount_in_limit_currency) VALUES($1,$2,2.5,100)",
    [payment, old],
  );
  await fixture.pool.query(
    "INSERT INTO records(type,amount,currency,credit_card_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES('expense',30,'UYU',$1,$2,'credit','needs_review',1,'2026-03-05'),('expense',99,'UYU',$1,$2,'credit','cancelled',1,'2026-03-05')",
    [cardId, categoryId],
  );
  for (const instant of ["2026-01-01", "2026-02-15", "2026-03-01", "2026-03-10", "2027-02-10"]) {
    const dataset = await getWalletDataset(createDb());
    const card = dataset.creditCards.find((c) => c.id === cardId)!;
    const actual = await getCreditCardSummary(createDb(), cardId, new Date(instant));
    expect(actual).toEqual(calculateCreditCardSummary(dataset, card, new Date(instant)));
  }
  expect(await getCreditCardSummary(createDb(), randomUUID())).toBeNull();
});
