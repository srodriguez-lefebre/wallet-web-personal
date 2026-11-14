import { randomUUID } from "node:crypto";

import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { recordCreateSchema } from "../../shared/schemas.js";
import { createDb } from "./client.js";
import { createRecord, getWalletDataset, listCreditCardStatements } from "./index.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(),
  cardId = randomUUID(),
  categoryId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts,categories,credit_cards,settings CASCADE");
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic bank','bank','UYU',1000,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic category','blue','tag')",
    [categoryId],
  );
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Synthetic card','Synthetic bank','1234',10000,'UYU',20,5,'blue','card')",
    [cardId],
  );
});
test("dataset and statement reads never repair or update historical data", async () => {
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at) VALUES($1,'purchase',20,'UYU',20,1,$2,'2020-01-01')",
    [cardId, categoryId],
  );
  const transport = neonConfig.fetchFunction!;
  neonConfig.fetchFunction = async (input: string, options: RequestInit) => {
    const body = JSON.parse(options?.body as string) as {
      query?: string;
      queries?: { query: string }[];
    };
    for (const query of body.queries ?? [{ query: body.query ?? "" }])
      if (/\b(insert|update|delete)\b/i.test(query.query))
        throw new Error("Read attempted a write");
    return transport(input, options);
  };
  try {
    expect((await getWalletDataset(createDb())).creditCardRecords).toHaveLength(1);
    expect(await listCreditCardStatements(createDb(), cardId)).toEqual([]);
  } finally {
    neonConfig.fetchFunction = transport;
  }
  expect(
    (await fixture.pool.query("SELECT statement_id FROM credit_card_records")).rows[0],
  ).toEqual({ statement_id: null });
});
test("a wallet card mutation closes its historical cycle before any dataset read", async () => {
  await createRecord(
    createDb(),
    recordCreateSchema.parse({
      type: "expense",
      amount: 20,
      currency: "UYU",
      accountId,
      creditCardId: cardId,
      categoryId,
      paymentType: "credit",
      paymentStatus: "cleared",
      exchangeRateToPrimary: 1,
      amountInLimitCurrency: 20,
      exchangeRateToLimitCurrency: 1,
      occurredAt: "2020-02-29T12:00:00Z",
    }),
  );
  const rows = await fixture.pool.query(
    "SELECT s.cycle_start,s.cycle_end,s.due_at FROM credit_card_records r JOIN credit_card_statements s ON s.id=r.statement_id",
  );
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0]!.cycle_end.toISOString()).toBe("2020-03-20T23:59:59.999Z");
  expect(rows.rows[0]!.due_at.toISOString()).toBe("2020-04-05T23:59:59.999Z");
});
