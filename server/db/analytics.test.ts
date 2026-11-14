import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { getAnalyticsSummary } from "./analytics.js";
import { createDb } from "./client.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const bank = randomUUID(),
  hidden = randomUUID(),
  root = randomUUID(),
  child = randomUUID(),
  tag = randomUUID(),
  goal = randomUUID(),
  expense = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon,is_visible) VALUES($1,'Visible','bank','UYU',0,'blue','bank',true),($2,'Hidden','bank','UYU',0,'blue','bank',false)",
    [bank, hidden],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Root','blue','tag')",
    [root],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,parent_id,color,icon) VALUES($1,'Child',$2,'blue','tag')",
    [child, root],
  );
  await fixture.pool.query("INSERT INTO tags(id,name,color) VALUES($1,'Synthetic tag','blue')", [
    tag,
  ]);
  await fixture.pool.query(
    "INSERT INTO goals(id,name,target_amount,currency,color,icon) VALUES($1,'Synthetic goal',1000,'UYU','blue','flag')",
    [goal],
  );
  await fixture.pool.query(
    "INSERT INTO settings(primary_currency,include_hidden_accounts_in_reports) VALUES('UYU',false)",
  );
  await fixture.pool.query(
    "INSERT INTO records(id,type,amount,currency,account_id,account_amount,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',10,'USD',$2,400,$3,'debit','needs_review',40,'2026-03-10')",
    [expense, bank, child],
  );
  await fixture.pool.query("INSERT INTO record_tags(record_id,tag_id) VALUES($1,$2)", [
    expense,
    tag,
  ]);
  await fixture.pool.query(
    "INSERT INTO record_goals(record_id,goal_id,allocated_amount) VALUES($1,$2,5)",
    [expense, goal],
  );
  await fixture.pool.query(
    `INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,deleted_at) VALUES
  ('income',1000,'UYU',$1,$3,'debit','cleared',1,'2026-03-01T12:00:00Z',NULL),
  ('expense',20,'UYU',$1,$3,'debit','cleared',1,'2026-03-11',NULL),
  ('expense',999,'UYU',$1,$3,'debit','cancelled',1,'2026-03-11',NULL),
  ('expense',888,'UYU',$1,$3,'debit','cleared',1,'2026-03-11',now()),
  ('expense',3,'USD',$1,$3,'debit','needs_review',0,'2026-03-12',NULL),
  ('expense',50,'UYU',$2,$3,'debit','cleared',1,'2026-03-11',NULL),
  ('expense',70,'UYU',$1,$3,'debit','cleared',1,'2026-03-01T01:00:00Z',NULL)`,
    [bank, hidden, child],
  );
  await fixture.pool.query(
    "INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',999,'2026-01-01')",
  );
  await fixture.pool.query(
    "INSERT INTO budgets(name,limit_amount,currency,category_id,tag_id,goal_id,color) VALUES('Linked budget',1000,'UYU',$1,$2,$3,'blue')",
    [root, tag, goal],
  );
  await fixture.pool.query(
    "INSERT INTO budgets(name,limit_amount,currency,color) VALUES('Missing conversion',100,'EUR','blue')",
  );
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});
test("analytics uses frozen values, review impact, visibility, category ancestors and allocated budgets", async () => {
  const data = await getAnalyticsSummary(createDb(), {
    from: "2026-03-01",
    to: "2026-03-31",
    timeZone: "America/Montevideo",
  });
  expect(data).toMatchObject({ income: 1000, expenses: 420, cashFlow: 580, unresolvedRecords: 1 });
  expect(data.monthlySeries).toEqual([
    { month: "2026-03", income: 1000, expenses: 420, cashFlow: 580 },
  ]);
  expect(data.categories.find((c) => c.id === root)).toMatchObject({ expenses: 420, income: 1000 });
  expect(data.budgets.find((b) => b.budget.name === "Linked budget")).toMatchObject({
    spent: 200,
    remaining: 800,
    percentage: 20,
    status: "ok",
    unresolvedRecords: 0,
  });
  expect(data.budgets.find((b) => b.budget.name === "Missing conversion")).toMatchObject({
    spent: null,
    status: "warning",
    unresolvedRecords: 3,
  });
});
test("explicit account and timezone override the general visibility/date policy", async () => {
  expect(
    await getAnalyticsSummary(createDb(), {
      from: "2026-03-01",
      to: "2026-03-31",
      timeZone: "UTC",
      accountId: hidden,
    }),
  ).toMatchObject({ expenses: 50, income: 0 });
  expect(
    await getAnalyticsSummary(createDb(), {
      from: "2026-03-01",
      to: "2026-03-31",
      timeZone: "UTC",
      accountId: bank,
    }),
  ).toMatchObject({ expenses: 490, income: 1000 });
  const data = await getAnalyticsSummary(createDb(), {
    from: "2026-01-01",
    to: "2026-03-31",
    timeZone: "UTC",
  });
  expect(data.monthlySeries.slice(0, 2)).toEqual([
    { month: "2026-01", income: 0, expenses: 0, cashFlow: 0 },
    { month: "2026-02", income: 0, expenses: 0, cashFlow: 0 },
  ]);
});
test("named IANA zones preserve positive-offset local date boundaries", async () => {
  const query = { from: "2026-03-01", to: "2026-03-31" };
  const beforeParis = await getAnalyticsSummary(createDb(), { ...query, timeZone: "Europe/Paris" });
  const beforeUtc = await getAnalyticsSummary(createDb(), { ...query, timeZone: "UTC" });
  const id = randomUUID();
  try {
    await fixture.pool.query(
      "INSERT INTO records(id,type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',11,'UYU',$2,$3,'debit','cleared',1,'2026-02-28T23:30:00Z')",
      [id, bank, child],
    );
    expect(
      (await getAnalyticsSummary(createDb(), { ...query, timeZone: "Europe/Paris" })).expenses -
        beforeParis.expenses,
    ).toBe(11);
    expect((await getAnalyticsSummary(createDb(), { ...query, timeZone: "UTC" })).expenses).toBe(
      beforeUtc.expenses,
    );
  } finally {
    await fixture.pool.query("DELETE FROM records WHERE id=$1", [id]);
  }
});
