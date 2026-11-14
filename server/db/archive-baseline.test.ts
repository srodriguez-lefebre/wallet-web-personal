import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDb } from "./client.js";
import * as repository from "./index.js";
import { restoreWalletBackup } from "./wallet-restore.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const account = randomUUID(),
  category = randomUUID(),
  card = randomUUID(),
  tag = randomUUID(),
  debt = randomUUID(),
  record = randomUUID(),
  plan = randomUUID(),
  budget = randomUUID(),
  investment = randomUUID(),
  recurring = randomUUID(),
  payment = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic bank','bank','UYU',100,'blue','bank')",
    [account],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic category','blue','tag')",
    [category],
  );
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Synthetic card','Synthetic bank','1234',10000,'UYU',20,5,'blue','card')",
    [card],
  );
  await fixture.pool.query(
    "INSERT INTO tags(id,name,color,deleted_at) VALUES($1,'Archived tag','blue',now())",
    [tag],
  );
  await fixture.pool.query(
    "INSERT INTO debts(id,name,currency,category_id,started_at,deleted_at) VALUES($1,'Archived debt','UYU',$2,'2026-01-01',now())",
    [debt, category],
  );
  await fixture.pool.query(
    "INSERT INTO recurring_debts(id,name,currency,counterparty_name,category_id,day_of_month,started_at,deleted_at) VALUES($1,'Archived recurring','UYU','Synthetic',$2,1,'2026-01-01',now())",
    [recurring, category],
  );
  await fixture.pool.query(
    "INSERT INTO budgets(id,name,limit_amount,currency,color,deleted_at) VALUES($1,'Archived budget',100,'UYU','blue',now())",
    [budget],
  );
  await fixture.pool.query(
    "INSERT INTO investments(id,name,type,amount_invested,current_value,currency,started_at,deleted_at) VALUES($1,'Archived investment','stock',20,20,'UYU','2026-01-01',now())",
    [investment],
  );
  await fixture.pool.query(
    "INSERT INTO installment_plans(id,name,total_amount,currency,installments_total,installments_paid,account_id,category_id,deleted_at) VALUES($1,'Archived plan',20,'UYU',2,0,$2,$3,now())",
    [plan, account, category],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_payments(id,credit_card_id,amount,currency,amount_in_limit_currency,occurred_at,idempotency_key,request_hash,deleted_at) VALUES($1,$2,10,'UYU',10,'2026-01-01','synthetic-retained-key','synthetic-hash',now())",
    [payment, card],
  );
  await fixture.pool.query(
    "INSERT INTO records(id,type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,debt_id) VALUES($1,'expense',12,'UYU',$2,$3,'debit','cleared',1,'2026-01-01',$4)",
    [record, account, category, debt],
  );
  await fixture.pool.query("INSERT INTO record_tags(record_id,tag_id) VALUES($1,$2)", [
    record,
    tag,
  ]);
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});
test("the baseline reads archived entities safely and preserves them through backup/restore", async () => {
  const db = createDb(),
    data = await repository.getWalletDataset(db);
  for (const list of [
    repository.listTags,
    repository.listDebts,
    repository.listRecurringDebts,
    repository.listBudgets,
    repository.listInvestments,
    repository.listInstallmentPlans,
  ])
    expect(await list(db)).toEqual([]);
  for (const key of [
    "tags",
    "debts",
    "recurringDebts",
    "budgets",
    "investments",
    "installmentPlans",
    "creditCardPayments",
  ] as const)
    expect(data[key]).toEqual([]);
  expect(data.records).toContainEqual(
    expect.objectContaining({ id: record, debtId: debt, amount: 12 }),
  );
  const backup = await repository.getWalletBackup(db);
  for (const key of [
    "tags",
    "debts",
    "recurringDebts",
    "budgets",
    "investments",
    "installmentPlans",
    "creditCardPayments",
  ] as const)
    expect(backup[key]).toHaveLength(1);
  await restoreWalletBackup(db, backup);
  expect((await repository.getWalletDataset(db)).creditCardPayments).toEqual([]);
  expect((await repository.getWalletBackup(db)).creditCardPayments[0]).toMatchObject({
    id: payment,
    idempotencyKey: "synthetic-retained-key",
    deletedAt: expect.any(String),
  });
});
test("legacy delete requests cannot erase archived retry identities or their historical links", async () => {
  const db = createDb();
  expect(await repository.deleteTag(db, tag)).toBe(false);
  expect(await repository.deleteDebt(db, debt)).toBe(false);
  expect(await repository.deleteRecurringDebt(db, recurring)).toBe(false);
  expect(await repository.deleteBudget(db, budget)).toBe(false);
  expect(await repository.deleteInvestment(db, investment)).toBe(false);
  expect(await repository.deleteInstallmentPlan(db, plan)).toBe(false);
  expect(await repository.deleteCreditCardPayment(db, card, payment)).toBe(false);
  expect(
    (await fixture.pool.query("SELECT tag_id FROM record_tags WHERE record_id=$1", [record])).rows,
  ).toEqual([{ tag_id: tag }]);
  expect(
    (
      await fixture.pool.query("SELECT idempotency_key FROM credit_card_payments WHERE id=$1", [
        payment,
      ])
    ).rows,
  ).toEqual([{ idempotency_key: "synthetic-retained-key" }]);
});
