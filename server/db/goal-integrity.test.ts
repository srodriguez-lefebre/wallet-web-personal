import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import {
  applyMigrations,
  installLocalTransport,
  LOCAL_DATABASE_URL,
} from "../../scripts/sandbox/database.js";
import { importSnapshot } from "../../scripts/sandbox/snapshot.js";
import { calculateAccountBalances, calculateGoalProgress } from "../../shared/calculations.js";
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
  prepareRecordGoalWrites,
  releaseGoalReservation,
  updateGoal,
  updateRecord,
} from "./index.js";
import { records } from "./schema.js";
const pg = new PGlite();
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const goalId = "00000000-0000-4000-8000-000000000003";
const date = "2026-06-21T12:00:00.000Z";
let restore: () => void;
beforeAll(async () => {
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  restore = installLocalTransport(pg);
  await applyMigrations(pg);
}, 30000);
afterAll(async () => {
  restore();
  await pg.close();
});
beforeEach(async () => {
  await pg.exec("TRUNCATE accounts, categories, settings, goals, tags, exchange_rates CASCADE");
  await importSnapshot(pg, {
    settings: { primaryCurrency: "UYU" },
    accounts: [
      {
        id: accountId,
        name: "Account",
        type: "bank",
        currency: "UYU",
        initialBalance: 1000,
        color: "blue",
        icon: "bank",
      },
    ],
    categories: [{ id: categoryId, name: "Category", color: "blue", icon: "bank" }],
    goals: [
      {
        id: goalId,
        name: "Goal",
        targetAmount: 100,
        currency: "UYU",
        color: "blue",
        icon: "bank",
        autoReservationAccountId: accountId,
      },
    ],
    records: [],
  });
});
const input = (overrides = {}) =>
  recordSchema.parse({
    type: "expense",
    amount: 40,
    currency: "UYU",
    accountId,
    categoryId,
    paymentType: "debit",
    paymentStatus: "cleared",
    occurredAt: date,
    goalIds: [goalId],
    ...overrides,
  });
const reserve = () =>
  createGoalReservation(createDb(), {
    goalId,
    accountId,
    amount: 100,
    currency: "UYU",
    createdAt: date,
  });
test.each(["cleared", "needs_review"])(
  "closing before the target releases each remaining source reserve without changing totals or %s history",
  async (paymentStatus) => {
    const secondAccount = "00000000-0000-4000-8000-000000000005";
    await pg.query(
      "insert into accounts(id,name,type,currency,initial_balance,color,icon) values ($1,'USD source','bank','USD',500,'blue','bank')",
      [secondAccount],
    );
    await pg.query(
      "update goals set target_amount=1000,auto_capture_enabled=true,auto_capture_start='2026-06-01',auto_capture_end='2026-06-30'",
    );
    await reserve();
    await createGoalReservation(createDb(), {
      goalId,
      accountId: secondAccount,
      amount: 20,
      currency: "USD",
      createdAt: date,
    });
    await createRecord(createDb(), input({ paymentStatus }));
    const before = await getWalletDataset(createDb());
    const totals = calculateAccountBalances(before).map((account) => account.totalBalance);
    await updateGoal(createDb(), goalId, { status: "completed" });
    const after = await getWalletDataset(createDb());
    expect(after.goals[0]!).toMatchObject({ status: "completed", autoCaptureEnabled: false });
    expect(after.goalReservations).toEqual([]);
    expect(calculateGoalProgress(after)[0]!.spent).toBe(40);
    expect(after.records).toEqual(before.records);
    expect(calculateAccountBalances(after).map((account) => account.totalBalance)).toEqual(totals);
    const released = await pg.query(
      "select account_id,amount,currency from goal_reservation_movements where type='release' order by currency",
    );
    expect(released.rows).toEqual([
      { account_id: secondAccount, amount: "20.00", currency: "USD" },
      { account_id: accountId, amount: "60.00", currency: "UYU" },
    ]);
    await updateGoal(createDb(), goalId, { status: "completed" });
    expect(
      (await pg.query("select id from goal_reservation_movements where type='release'")).rows,
    ).toHaveLength(2);
    await expect(reserve()).rejects.toThrow();
    const later = await createRecord(createDb(), input({ goalIds: [] }));
    expect(later.goalIds).toEqual([]);
  },
);
test("closing rolls back the goal and all releases if a release fails", async () => {
  await reserve();
  await pg.exec(
    "create function reject_goal_close_release() returns trigger language plpgsql as $$ begin if NEW.type='release' then raise exception 'simulated release failure'; end if; return NEW; end $$; create trigger reject_goal_close_release before insert on goal_reservation_movements for each row execute function reject_goal_close_release();",
  );
  try {
    await expect(updateGoal(createDb(), goalId, { status: "completed" })).rejects.toThrow();
    const dataset = await getWalletDataset(createDb());
    expect(dataset.goals[0]!.status).toBe("active");
    expect(dataset.goalReservations[0]!.amount).toBe(100);
    expect(dataset.goalReservationMovements).toHaveLength(1);
  } finally {
    await pg.exec(
      "drop trigger reject_goal_close_release on goal_reservation_movements; drop function reject_goal_close_release();",
    );
  }
});
test.each(["delete", "cancel", "edit"])(
  "completed goals stay released when a historical record is changed with %s",
  async (action) => {
    await reserve();
    const record = await createRecord(createDb(), input());
    await updateGoal(createDb(), goalId, { status: "completed" });
    if (action === "delete") await deleteRecord(createDb(), record.id);
    if (action === "cancel")
      await updateRecord(createDb(), record.id, { paymentStatus: "cancelled" });
    if (action === "edit") await updateRecord(createDb(), record.id, { amount: 20 });
    expect(await listGoalReservations(createDb())).toEqual([]);
  },
);
test.each(["delete", "cancel", "edit"])(
  "archived goal remains fully released after record %s",
  async (action) => {
    await reserve();
    const record = await createRecord(createDb(), input());
    await deleteGoal(createDb(), goalId);
    if (action === "delete") await deleteRecord(createDb(), record.id);
    if (action === "cancel")
      await updateRecord(createDb(), record.id, { paymentStatus: "cancelled" });
    if (action === "edit") await updateRecord(createDb(), record.id, { amount: 20 });
    expect(await listGoalReservations(createDb())).toEqual([]);
  },
);
test("concurrent partial releases cannot overdraw the SQL ledger", async () => {
  await reserve();
  const results = await Promise.allSettled(
    [80, 80].map((amount) => releaseGoalReservation(createDb(), { goalId, accountId, amount })),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect((await listGoalReservations(createDb()))[0]!.amount).toBe(20);
});
test("concurrent expenses consume only the available reserve", async () => {
  await reserve();
  await Promise.all([
    createRecord(createDb(), input({ amount: 80 })),
    createRecord(createDb(), input({ amount: 80 })),
  ]);
  const ledger = await pg.query<{
    amount: string;
  }>(
    "select sum(case when type in ('reserve','restore') then amount else -amount end) as amount from goal_reservation_movements",
  );
  expect(Number(ledger.rows[0]!.amount)).toBe(0);
});
test("legacy goalIds empty patch removes links and restores consumed reserve", async () => {
  await reserve();
  const record = await createRecord(createDb(), input());
  const updated = await updateRecord(createDb(), record.id, { goalIds: [] });
  expect(updated?.goalAssociations).toEqual([]);
  expect((await listGoalReservations(createDb()))[0]!.amount).toBe(100);
  expect((await getWalletDataset(createDb())).records[0]!.goalIds).toEqual([]);
});
test("amount patch rejects an existing allocation exceeding the new amount", async () => {
  const record = await createRecord(
    createDb(),
    input({ amount: 100, goalAssociations: [{ goalId, allocatedAmount: 80 }] }),
  );
  await expect(updateRecord(createDb(), record.id, { amount: 50 })).rejects.toThrow();
  expect((await getWalletDataset(createDb())).records[0]!.amount).toBe(100);
});
test("creation schema rejects excess allocation", () => {
  expect(() => input({ goalAssociations: [{ goalId, allocatedAmount: 80 }] })).toThrow();
});
test("a note-only edit does not retroactively capture an old record", async () => {
  const record = await createRecord(createDb(), input({ goalIds: [] }));
  await pg.query(
    "update goals set auto_capture_enabled=true, auto_capture_start='2026-06-01', auto_capture_end='2026-06-30'",
  );
  expect((await updateRecord(createDb(), record.id, { note: "Updated" }))?.goalIds).toEqual([]);
});
test("date changes re-evaluate automatic associations while preserving manual links", async () => {
  await pg.query(
    "update goals set auto_capture_enabled=true, auto_capture_start='2026-06-01', auto_capture_end='2026-06-30'",
  );
  const automatic = await createRecord(createDb(), input({ goalIds: [] }));
  expect(automatic.goalAssociations?.[0]!.assignmentSource).toBe("date_rule");
  expect(
    (
      await updateRecord(createDb(), automatic.id, {
        occurredAt: "2026-07-01T12:00:00.000Z",
      })
    )?.goalIds,
  ).toEqual([]);
  const outside = await createRecord(
    createDb(),
    input({ goalIds: [], occurredAt: "2026-07-02T12:00:00.000Z" }),
  );
  expect((await updateRecord(createDb(), outside.id, { occurredAt: date }))?.goalIds).toEqual([
    goalId,
  ]);
  const manual = await createRecord(createDb(), input());
  expect(
    (await updateRecord(createDb(), manual.id, { occurredAt: "2026-07-01T12:00:00.000Z" }))
      ?.goalIds,
  ).toEqual([goalId]);
});
test("fallback reservation conversion uses the destination account currency and ignores unowned accountAmount", async () => {
  await pg.query("update accounts set initial_balance=0");
  await pg.query("update accounts set currency='USD',initial_balance=1000");
  await pg.query(
    "insert into exchange_rates (from_currency,to_currency,rate,date) values ('UYU','USD',0.025,'2026-06-01')",
  );
  await createGoalReservation(createDb(), {
    goalId,
    accountId,
    amount: 100,
    currency: "USD",
    createdAt: date,
  });
  const db = createDb();
  const recordId = randomUUID();
  const record = {
    ...input({ accountId: undefined, paymentStatus: "needs_review" }),
    paymentStatus: "cleared" as const,
  };
  // Validated card-only movements may carry an amount without owning its account. The helper
  // must never interpret that value as the fallback account's currency amount.
  const prepared = await prepareRecordGoalWrites(db, recordId, { ...record, accountAmount: 400 });
  await db.batch([
    ...prepared.lockQueries,
    db.insert(records).values({
      id: recordId,
      type: record.type,
      currency: record.currency,
      categoryId,
      paymentType: record.paymentType,
      paymentStatus: record.paymentStatus,
      amount: "40",
      exchangeRateToPrimary: "1",
      occurredAt: new Date(date),
    }),
    ...prepared.queries,
  ] as unknown as Parameters<typeof db.batch>[0]);
  const rows = await pg.query<{
    amount: string;
    currency: string;
  }>("select amount,currency from goal_reservation_movements where type='consume'");
  expect(rows.rows).toEqual([{ amount: "1.00", currency: "USD" }]);
});
test("missing as-of conversion rejects rather than inventing an account amount", async () => {
  await pg.query("update accounts set initial_balance=0");
  await pg.query("update accounts set currency='USD',initial_balance=1000");
  await expect(
    prepareRecordGoalWrites(createDb(), randomUUID(), {
      ...input({ accountId: undefined, paymentStatus: "needs_review" }),
      paymentStatus: "cleared",
    }),
  ).rejects.toThrow();
});
test.each(["create", "bulk", "update"])(
  "an unresolved automatic reservation skips only that goal while preserving review records during %s",
  async (action) => {
    await pg.query("update accounts set initial_balance=0");
    await pg.query("update accounts set currency='USD',initial_balance=1000");
    await pg.query(
      "update goals set auto_capture_enabled=true,auto_capture_start='2026-06-01',auto_capture_end='2026-06-30'",
    );
    const reviewInput = input({ goalIds: [], accountId: undefined, paymentStatus: "needs_review" });
    const record =
      action === "bulk"
        ? (await createRecordsBulk(createDb(), [reviewInput]))[0]!
        : action === "update"
          ? (await updateRecord(
              createDb(),
              (
                await createRecord(createDb(), {
                  ...reviewInput,
                  occurredAt: "2026-07-01T12:00:00.000Z",
                })
              ).id,
              { occurredAt: date },
            ))!
          : await createRecord(createDb(), reviewInput);
    expect(record.goalIds).toEqual([]);
    expect((await getWalletDataset(createDb())).records[0]!.id).toBe(record.id);
    expect(record.note).toContain("automatic capture skipped");
    expect(await listGoalReservations(createDb())).toEqual([]);
  },
);
test("bulk consumption and income reserves share the transaction's current ledger", async () => {
  await createRecordsBulk(createDb(), [
    input({ type: "income", amount: 100 }),
    input({ amount: 80 }),
    input({ amount: 80 }),
  ]);
  expect(await listGoalReservations(createDb())).toEqual([]);
});
test("wallet roundtrip retains legacy goal tag mappings", async () => {
  const tagId = "00000000-0000-4000-8000-000000000004";
  await pg.query("insert into tags (id,name,color) values ($1,'Legacy','blue')", [tagId]);
  await pg.query("insert into goal_tags (goal_id,tag_id) values ($1,$2)", [goalId, tagId]);
  expect((await getWalletDataset(createDb())).goals[0]!.tagIds).toEqual([tagId]);
  expect((await updateGoal(createDb(), goalId, { name: "Updated" }))?.tagIds).toEqual([tagId]);
});
test("full release racing a consumption preserves a nonnegative ledger", async () => {
  const reserved = await reserve();
  await Promise.all([
    deleteGoalReservation(createDb(), reserved.id),
    createRecord(createDb(), input({ amount: 80 })),
  ]);
  const ledger = await pg.query<{
    amount: string;
  }>(
    "select sum(case when type in ('reserve','restore') then amount else -amount end) as amount from goal_reservation_movements",
  );
  expect(Number(ledger.rows[0]!.amount)).toBe(0);
});
test("archive racing an expense and a new reservation leaves no invisible reserve", async () => {
  await reserve();
  await Promise.allSettled([
    deleteGoal(createDb(), goalId),
    createRecord(createDb(), input()),
    reserve(),
  ]);
  expect(await listGoalReservations(createDb())).toEqual([]);
  await expect(reserve()).rejects.toThrow();
});
test("reservation currency must equal its account currency", async () => {
  await expect(
    createGoalReservation(createDb(), {
      goalId,
      accountId,
      amount: 10,
      currency: "USD",
      createdAt: date,
    }),
  ).rejects.toThrow();
  expect(await listGoalReservations(createDb())).toEqual([]);
});
test("reversing already consumed reserved income rolls back the record change", async () => {
  const income = await createRecord(createDb(), input({ type: "income", amount: 100 }));
  await createRecord(createDb(), input({ amount: 80 }));
  await expect(deleteRecord(createDb(), income.id)).rejects.toThrow();
  expect((await getWalletDataset(createDb())).records.map((record) => record.id)).toContain(
    income.id,
  );
  expect((await listGoalReservations(createDb()))[0]!.amount).toBe(20);
});
test("disabled monetary flags do not require an unused currency conversion", async () => {
  await pg.query("update accounts set initial_balance=0");
  await pg.query("update accounts set currency='USD',initial_balance=1000");
  await expect(
    createRecord(
      createDb(),
      input({
        accountId: undefined,
        paymentStatus: "needs_review",
        goalIds: [],
        goalAssociations: [{ goalId, useReserved: false, reserveIncome: false }],
      }),
    ),
  ).resolves.toMatchObject({ goalIds: [goalId] });
});
test("the ingestion helper applies automatic capture and reserve consumption in its caller's atomic batch", async () => {
  await reserve();
  await pg.query(
    "update goals set auto_capture_enabled=true, auto_capture_start='2026-06-01', auto_capture_end='2026-06-30'",
  );
  const db = createDb();
  const recordId = randomUUID();
  const record = input({ goalIds: [] });
  const prepared = await prepareRecordGoalWrites(db, recordId, record);
  await db.batch([
    ...prepared.lockQueries,
    db.insert(records).values({
      id: recordId,
      type: record.type,
      currency: record.currency,
      accountId,
      categoryId,
      paymentType: record.paymentType,
      paymentStatus: record.paymentStatus,
      amount: "40",
      exchangeRateToPrimary: "1",
      occurredAt: new Date(date),
    }),
    ...prepared.queries,
  ] as unknown as Parameters<typeof db.batch>[0]);
  const dataset = await getWalletDataset(db);
  expect(dataset.records[0]!.goalAssociations?.[0]).toMatchObject({
    goalId,
    assignmentSource: "date_rule",
  });
  expect(dataset.goalReservations[0]!.amount).toBe(60);
});
