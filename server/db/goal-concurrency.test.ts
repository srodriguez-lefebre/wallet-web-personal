import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { recordSchema } from "../../shared/schemas.js";
import { createDb } from "./client.js";
import {
  createGoalReservation,
  createRecord,
  createRecordsBulk,
  deleteGoal,
  deleteGoalReservation,
  deleteRecord,
  getWalletDataset,
  listGoalReservations,
  releaseGoalReservation,
  updateGoal,
  updateRecord,
} from "./index.js";
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const goalId = "00000000-0000-4000-8000-000000000003";
const date = "2026-06-21T12:00:00.000Z";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  if (fixture) await fixture.close();
}, 30000);
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts,categories,settings,goals CASCADE");
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
  await fixture.pool.query("insert into settings(primary_currency) values ('UYU')");
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
  createGoalReservation(createDb(), {
    goalId,
    accountId,
    amount: 100,
    currency: "UYU",
    createdAt: date,
  });
async function balance() {
  const result = await fixture.pool.query<{
    amount: string;
  }>(
    "select coalesce(sum(case when type in ('reserve','restore') then amount else -amount end),0) as amount from goal_reservation_movements",
  );
  return Number(result.rows[0]!.amount);
}
test("independent repeated closes release the ledger once", async () => {
  await reserve();
  const record = await createRecord(createDb(), input(40));
  await Promise.all([
    updateGoal(createDb(), goalId, { status: "completed" }),
    updateGoal(createDb(), goalId, { status: "completed" }),
  ]);
  expect(await balance()).toBe(0);
  const releases = await fixture.pool.query(
    "select amount from goal_reservation_movements where type='release'",
  );
  expect(releases.rows).toEqual([{ amount: "60.00" }]);
  const dataset = await getWalletDataset(createDb());
  expect(dataset.goals[0]!.status).toBe("completed");
  expect(dataset.records[0]!.id).toBe(record.id);
});
test("clearing a review changes no reservation consumption after a later reserve", async () => {
  await createGoalReservation(createDb(), {
    goalId,
    accountId,
    amount: 40,
    currency: "UYU",
    createdAt: date,
  });
  const record = await createRecord(createDb(), { ...input(100), paymentStatus: "needs_review" });
  expect(await balance()).toBe(0);
  await createGoalReservation(createDb(), {
    goalId,
    accountId,
    amount: 60,
    currency: "UYU",
    createdAt: date,
  });
  const before = (await getWalletDataset(createDb())).goalReservationMovements;
  await updateRecord(createDb(), record.id, { paymentStatus: "cleared" });
  expect(await balance()).toBe(60);
  expect((await getWalletDataset(createDb())).goalReservationMovements).toEqual(before);
});
test("closing races with expense reconciliation and reservations without recreating a reserve", async () => {
  await reserve();
  const record = await createRecord(createDb(), input(40));
  await Promise.allSettled([
    updateGoal(createDb(), goalId, { status: "completed" }),
    updateRecord(createDb(), record.id, { amount: 20 }),
    reserve(),
  ]);
  expect(await balance()).toBe(0);
  expect((await getWalletDataset(createDb())).goals[0]!.status).toBe("completed");
  await expect(reserve()).rejects.toThrow();
});
test("a concurrent note edit preserves the completed status", async () => {
  await reserve();
  await Promise.all([
    updateGoal(createDb(), goalId, { status: "completed" }),
    updateGoal(createDb(), goalId, { note: "History retained" }),
  ]);
  const goal = (await getWalletDataset(createDb())).goals[0]!;
  expect(goal).toMatchObject({
    status: "completed",
    note: "History retained",
    autoCaptureEnabled: false,
  });
  expect(await balance()).toBe(0);
});
test.each([
  ["single", "close"],
  ["bulk", "close"],
  ["single", "disable"],
  ["single", "range"],
])(
  "a prepared %s automatic capture cannot link or consume after %s wins the lock",
  async (kind, change) => {
    await reserve();
    await fixture.pool.query(
      "update goals set auto_capture_enabled=true,auto_capture_start='2026-06-01',auto_capture_end='2026-06-30'",
    );
    const transport = neonConfig.fetchFunction!;
    let prepared!: () => void;
    let proceed!: () => void;
    const preparation = new Promise<void>((resolve) => {
      prepared = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    neonConfig.fetchFunction = async (url: string, options: RequestInit) => {
      const body = JSON.parse(options?.body as string) as {
        queries?: {
          query: string;
        }[];
      };
      if (body.queries?.some((query) => query.query.includes('insert into "records"'))) {
        prepared();
        await closed;
      }
      return transport(url, options);
    };
    try {
      const automaticInput = recordSchema.parse({ ...input(40), goalIds: [] });
      const creation =
        kind === "single"
          ? createRecord(createDb(), automaticInput)
          : createRecordsBulk(createDb(), [automaticInput]);
      await preparation;
      await updateGoal(
        createDb(),
        goalId,
        change === "close"
          ? { status: "completed" }
          : change === "disable"
            ? { autoCaptureEnabled: false }
            : { autoCaptureEnd: "2026-06-10" },
      );
      proceed();
      const result = await creation;
      expect((Array.isArray(result) ? result[0]! : result).goalIds).toEqual([]);
      expect((await getWalletDataset(createDb())).records[0]!.goalIds).toEqual([]);
      expect(await balance()).toBe(change === "close" ? 0 : 100);
    } finally {
      proceed();
      neonConfig.fetchFunction = transport;
    }
  },
);
test("concurrent goal date edits cannot commit an invalid automatic capture interval", async () => {
  await fixture.pool.query(
    "update goals set auto_capture_enabled=true,auto_capture_start='2026-06-01',auto_capture_end='2026-06-30'",
  );
  const transport = neonConfig.fetchFunction!;
  let arrivals = 0;
  let release!: () => void;
  const prepared = new Promise<void>((resolve) => {
    release = resolve;
  });
  neonConfig.fetchFunction = async (url: string, options: RequestInit) => {
    const body = JSON.parse(options?.body as string) as {
      queries?: {
        query: string;
      }[];
    };
    if (body.queries?.some((query) => query.query.includes('update "goals"'))) {
      arrivals += 1;
      if (arrivals === 2) release();
      await prepared;
    }
    return transport(url, options);
  };
  try {
    const outcomes = await Promise.allSettled([
      updateGoal(createDb(), goalId, { autoCaptureStart: "2026-06-20" }),
      updateGoal(createDb(), goalId, { autoCaptureEnd: "2026-06-10" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409, code: "CONFLICT" });
    const goal = (await getWalletDataset(createDb())).goals[0]!;
    expect(goal.autoCaptureStart! <= goal.autoCaptureEnd!).toBe(true);
  } finally {
    neonConfig.fetchFunction = transport;
  }
});
test("independent connections serialize partial release guards", async () => {
  await reserve();
  const results = await Promise.allSettled(
    [80, 80].map((amount) => releaseGoalReservation(createDb(), { goalId, accountId, amount })),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await balance()).toBe(20);
});
test("independent expense connections cap consumption at the current numeric balance", async () => {
  await reserve();
  await Promise.all([createRecord(createDb(), input()), createRecord(createDb(), input())]);
  expect(await balance()).toBe(0);
  const result = await fixture.pool.query<{
    amount: string;
  }>("select sum(amount) as amount from goal_reservation_movements where type='consume'");
  expect(Number(result.rows[0]!.amount)).toBe(100);
});
test("independent connections cannot archive and recreate an invisible reserve", async () => {
  await reserve();
  const record = await createRecord(createDb(), input(40));
  await Promise.all([deleteGoal(createDb(), goalId), deleteRecord(createDb(), record.id)]);
  expect(await balance()).toBe(0);
  expect(await listGoalReservations(createDb())).toEqual([]);
});
test("archiving and editing an expense keeps both outcomes consistent", async () => {
  await reserve();
  const record = await createRecord(createDb(), input(40));
  await Promise.all([
    deleteGoal(createDb(), goalId),
    updateRecord(createDb(), record.id, { amount: 20 }),
  ]);
  expect(await balance()).toBe(0);
});
test("independent full release and expense transactions never overdraw", async () => {
  const reserved = await reserve();
  await Promise.all([
    deleteGoalReservation(createDb(), reserved.id),
    createRecord(createDb(), input()),
  ]);
  expect(await balance()).toBe(0);
});
test("a stale concurrent edit returns a conflict and leaves the committed record and reserve consistent", async () => {
  await reserve();
  const record = await createRecord(createDb(), input(40));
  const transport = neonConfig.fetchFunction!;
  let arrivals = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Hold both prepared mutation batches so each read the same initial record.
  // The real PostgreSQL row lock and snapshot guard decide which one commits.
  neonConfig.fetchFunction = async (url: string, options: RequestInit) => {
    const body = JSON.parse(options?.body as string) as {
      queries?: {
        query: string;
      }[];
    };
    if (body.queries?.some((query) => query.query.includes("date_trunc('milliseconds'"))) {
      arrivals += 1;
      if (arrivals === 2) release();
      await ready;
    }
    return transport(url, options);
  };
  try {
    const outcomes = await Promise.allSettled([
      updateRecord(createDb(), record.id, { amount: 20 }),
      updateRecord(createDb(), record.id, { amount: 30 }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409, code: "CONFLICT" });
  } finally {
    neonConfig.fetchFunction = transport;
  }
  const saved = (await getWalletDataset(createDb())).records.find((item) => item.id === record.id)!;
  expect([20, 30]).toContain(saved.amount);
  expect(await balance()).toBe(100 - saved.amount);
});
