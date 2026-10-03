import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { recordSchema } from "../../shared/schemas.js";
import {
  createGoalReservation,
  createRecord,
  deleteGoal,
  deleteGoalReservation,
  deleteRecord,
  getWalletDataset,
  listGoalReservations,
  releaseGoalReservation,
  updateRecord,
} from "./wallet-repository.js";

const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const goalId = "00000000-0000-4000-8000-000000000003";
const date = "2026-06-21T12:00:00.000Z";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  if (fixture) await fixture.close();
}, 30_000);
beforeEach(async () => {
  await fixture.pool.query(
    "TRUNCATE accounts,categories,settings,goals CASCADE",
  );
  await fixture.pool.query(
    "insert into accounts(id,name,type,currency,initial_balance,color,icon) values ($1,'Account','bank','UYU',1000,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "insert into categories(id,name,color,icon) values ($1,'Category','blue','bank')",
    [categoryId],
  );
  await fixture.pool.query(
    "insert into goals(id,name,target_amount,currency,color,icon,auto_reservation_account_id) values ($1,'Goal',100,'UYU','blue','bank',$2)",
    [goalId, accountId],
  );
  await fixture.pool.query(
    "insert into settings(primary_currency) values ('UYU')",
  );
});
const input = (amount = 80) =>
  recordSchema.parse({
    type: "expense",
    amount,
    currency: "UYU",
    accountId,
    categoryId,
    paymentType: "debit",
    paymentStatus: "cleared",
    occurredAt: date,
    goalIds: [goalId],
  });
const reserve = () =>
  createGoalReservation({
    goalId,
    accountId,
    amount: 100,
    currency: "UYU",
    createdAt: date,
  });
async function balance() {
  const result = await fixture.pool.query<{ amount: string }>(
    "select coalesce(sum(case when type in ('reserve','restore') then amount else -amount end),0) as amount from goal_reservation_movements",
  );
  return Number(result.rows[0].amount);
}

test("independent connections serialize partial release guards", async () => {
  await reserve();
  const results = await Promise.allSettled(
    [80, 80].map((amount) =>
      releaseGoalReservation({ goalId, accountId, amount }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(await balance()).toBe(20);
});

test("independent expense connections cap consumption at the current numeric balance", async () => {
  await reserve();
  await Promise.all([createRecord(input()), createRecord(input())]);
  expect(await balance()).toBe(0);
  const result = await fixture.pool.query<{ amount: string }>(
    "select sum(amount) as amount from goal_reservation_movements where type='consume'",
  );
  expect(Number(result.rows[0].amount)).toBe(100);
});

test("independent connections cannot archive and recreate an invisible reserve", async () => {
  await reserve();
  const record = await createRecord(input(40));
  await Promise.all([deleteGoal(goalId), deleteRecord(record.id)]);
  expect(await balance()).toBe(0);
  expect(await listGoalReservations()).toEqual([]);
});

test("archiving and editing an expense keeps both outcomes consistent", async () => {
  await reserve();
  const record = await createRecord(input(40));
  await Promise.all([
    deleteGoal(goalId),
    updateRecord(record.id, { amount: 20 }),
  ]);
  expect(await balance()).toBe(0);
});

test("independent full release and expense transactions never overdraw", async () => {
  const reserved = await reserve();
  await Promise.all([
    deleteGoalReservation(reserved.id),
    createRecord(input()),
  ]);
  expect(await balance()).toBe(0);
});

test("record edits recompute compensation after the previous transaction", async () => {
  await reserve();
  const record = await createRecord(input(40));
  await Promise.all([
    updateRecord(record.id, { amount: 20 }),
    updateRecord(record.id, { amount: 30 }),
  ]);
  const saved = (await getWalletDataset()).records.find(
    (item) => item.id === record.id,
  )!;
  expect(await balance()).toBe(100 - saved.amount);
});
