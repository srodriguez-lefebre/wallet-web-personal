import { randomUUID } from "node:crypto";

import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDb } from "./client.js";
import { bootstrapWallet, getWalletDataset } from "./dataset.js";
import { bootstrapWalletReference, getWalletReference } from "./reference.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const account = randomUUID(),
  archived = randomUUID(),
  category = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query(
    "INSERT INTO settings(primary_currency,review_seen_through) VALUES('UYU','2026-11-09T00:00:00Z')",
  );
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon,deleted_at) VALUES($1,'Synthetic active','bank','UYU',100,'blue','bank',NULL),($2,'Synthetic archived','bank','UYU',0,'blue','bank',now())",
    [account, archived],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic reference','blue','tag')",
    [category],
  );
  await fixture.pool.query(
    "INSERT INTO goals(name,target_amount,currency,color,icon) VALUES('Synthetic reference goal',100,'UYU','blue','flag')",
  );
  await fixture.pool.query(
    `INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,created_at,deleted_at) VALUES
    ('expense',10,'UYU',$1,$2,'debit','needs_review',1,'2020-06-01T01:30:00Z','2026-11-10T12:00:00Z',NULL),
    ('expense',20,'UYU',$1,$2,'debit','cancelled',1,'2020-07-01T12:00:00Z','2026-11-08T12:00:00Z',NULL),
    ('expense',30,'UYU',$1,$2,'debit','needs_review',1,'2010-01-01T12:00:00Z','2026-11-11T12:00:00Z',now())`,
    [account, category],
  );
}, 30_000);
afterAll(async () => fixture?.close());

test("reference reads one batch without writes or history payloads and keeps local calendar/review metadata", async () => {
  const previous = neonConfig.fetchFunction!;
  const queries: string[] = [];
  let calls = 0;
  neonConfig.fetchFunction = (input: string, init: RequestInit) => {
    calls++;
    const body = JSON.parse(init.body as string) as { queries: { query: string }[] };
    queries.push(...body.queries.map((row) => row.query));
    return previous(input, init);
  };
  try {
    const data = await getWalletReference(createDb(), { timeZone: "America/Montevideo" });
    expect(calls).toBe(1);
    expect(queries.some((query) => /\b(insert|update|delete)\b/i.test(query))).toBe(false);
    expect(data.accounts.map((row) => row.id)).toEqual([account]);
    expect(data.categories.some((row) => row.id === category)).toBe(true);
    expect(data.goals[0]).toMatchObject({ autoCaptureEnabled: false, tagIds: [] });
    for (const field of [
      "records",
      "creditCardRecords",
      "creditCardStatements",
      "creditCardPayments",
      "creditCardPaymentAllocations",
      "goalReservationMovements",
    ])
      expect(data).not.toHaveProperty(field);
    expect(data.recordSummary).toEqual({
      from: "2020-05-31",
      to: "2020-07-01",
      months: ["2020-07", "2020-05"],
      total: 2,
      review: 1,
      newReviews: 1,
      latestReviewAt: "2026-11-10T12:00:00.000Z",
    });
  } finally {
    neonConfig.fetchFunction = previous;
  }
});
test("reference bootstrap preserves its first page while the legacy snapshot/bootstrap contracts remain intact", async () => {
  const data = await bootstrapWalletReference(
    createDb(),
    { recordsLimit: 1, timeZone: "America/Montevideo" },
    new Date("2026-11-14T12:00:00Z"),
  );
  expect(data.reference).not.toHaveProperty("records");
  expect(data.recordsPage.items).toHaveLength(1);
  expect(data.recordsPage.hasMore).toBe(true);
  expect(data.recordsPage.nextCursor).toEqual(expect.any(String));
  expect(data.serverDate).toBe("2026-11-14");
  expect(data.generatedDebts).toEqual([]);
  const legacy = await getWalletDataset(createDb());
  expect(legacy.records).toHaveLength(2);
  const oldBootstrap = await bootstrapWallet(
    createDb(),
    { recordsLimit: 1 },
    new Date("2026-11-14T12:00:00Z"),
  );
  expect(oldBootstrap.dataset.records).toHaveLength(1);
  expect(oldBootstrap.recordsPage.hasMore).toBe(true);
});
