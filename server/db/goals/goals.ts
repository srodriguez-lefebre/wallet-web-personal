import { randomUUID } from "node:crypto";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { type GoalPatch, goalSchema } from "../../../shared/schemas.js";
import { conflictError, validationError } from "../../api/errors.js";
import { batchAssert } from "../batch.js";
import { mapGoal, toDate, toNumeric } from "../mappers.js";
import { isPgError } from "../pg-error.js";
import { budgets, goals, goalTags } from "../schema.js";
import { goalReservationLockQueries } from "./ledger.js";

import type { Db, NewGoal } from "../input-types.js";

export async function listGoals(db: Db) {
  const [rows, links] = await db.batch([
    db.select().from(goals).where(isNull(goals.deletedAt)),
    db.select().from(goalTags),
  ]);
  return rows.map((goal) =>
    mapGoal(
      goal,
      links.filter((link) => link.goalId === goal.id).map((link) => link.tagId),
    ),
  );
}

export async function assertNoAutoCaptureOverlap(
  db: Db,
  input: NewGoal,
  excludedId: string | undefined,
) {
  if (
    input.status !== "active" ||
    !input.autoCaptureEnabled ||
    !input.autoCaptureStart ||
    !input.autoCaptureEnd
  )
    return;
  const clauses = [
    isNull(goals.deletedAt),
    eq(goals.status, "active"),
    eq(goals.autoCaptureEnabled, true),
    sql`${goals.autoCaptureStart} <= ${input.autoCaptureEnd}`,
    sql`${goals.autoCaptureEnd} >= ${input.autoCaptureStart}`,
  ];
  if (excludedId) clauses.push(ne(goals.id, excludedId));
  const [overlap] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(...clauses))
    .limit(1);
  if (overlap) throw validationError("Automatic goal date ranges cannot overlap");
}

export async function createGoal(db: Db, input: NewGoal) {
  await assertNoAutoCaptureOverlap(db, input, undefined);
  const id = randomUUID();
  const [row] = await db
    .insert(goals)
    .values({
      id,
      name: input.name,
      targetAmount: toNumeric(input.targetAmount),
      currency: input.currency,
      color: input.color,
      icon: input.icon,
      isVisible: input.isVisible,
      deadline: toDate(input.deadline),
      status: input.status,
      accountId: input.accountId ?? null,
      autoCaptureEnabled: input.autoCaptureEnabled ?? false,
      autoCaptureStart: input.autoCaptureStart ?? null,
      autoCaptureEnd: input.autoCaptureEnd ?? null,
      autoReservationAccountId: input.autoReservationAccountId ?? null,
      note: input.note ?? null,
    })
    .returning();
  return mapGoal(row);
}

export async function updateGoal(db: Db, id: string, input: GoalPatch) {
  const [[current], tagRows] = await db.batch([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
      .limit(1),
    db.select().from(goalTags).where(eq(goalTags.goalId, id)),
  ]);
  if (!current) return null;
  const tagIds = tagRows.map((row) => row.tagId);
  const mapped = mapGoal(current, tagIds);
  const merged = goalSchema.parse({
    ...mapped,
    ...input,
    autoCaptureEnabled:
      (input.status ?? mapped.status) === "completed"
        ? false
        : (input.autoCaptureEnabled ?? mapped.autoCaptureEnabled),
    deadline: input.deadline === null ? undefined : (input.deadline ?? mapped.deadline),
    accountId: input.accountId === null ? undefined : (input.accountId ?? mapped.accountId),
    note: input.note === null ? undefined : (input.note ?? mapped.note),
    autoCaptureStart:
      input.autoCaptureStart === null
        ? undefined
        : (input.autoCaptureStart ?? mapped.autoCaptureStart),
    autoCaptureEnd:
      input.autoCaptureEnd === null ? undefined : (input.autoCaptureEnd ?? mapped.autoCaptureEnd),
    autoReservationAccountId:
      input.autoReservationAccountId === null
        ? undefined
        : (input.autoReservationAccountId ?? mapped.autoReservationAccountId),
  });
  await assertNoAutoCaptureOverlap(db, merged, id);
  // Persist only the requested fields: a note edit prepared before a concurrent
  // close must not restore the old active status or automatic capture setting.
  const values = {
    name: merged.name,
    targetAmount: toNumeric(merged.targetAmount),
    currency: merged.currency,
    color: merged.color,
    icon: merged.icon,
    isVisible: merged.isVisible,
    deadline: toDate(merged.deadline),
    status: merged.status,
    accountId: merged.accountId ?? null,
    autoCaptureEnabled: merged.autoCaptureEnabled,
    autoCaptureStart: merged.autoCaptureStart ?? null,
    autoCaptureEnd: merged.autoCaptureEnd ?? null,
    autoReservationAccountId: merged.autoReservationAccountId ?? null,
    note: merged.note ?? null,
  };
  const changes = Object.fromEntries(
    Object.entries(values).filter(([key]) => input[key as keyof GoalPatch] !== undefined),
  );
  const update = db
    .update(goals)
    .set({
      ...changes,
      ...(input.status === "completed"
        ? { autoCaptureEnabled: false }
        : input.autoCaptureEnabled !== undefined
          ? {
              autoCaptureEnabled: sql`case when ${input.status === undefined ? goals.status : sql`${input.status}`} = 'completed' then false else ${merged.autoCaptureEnabled} end`,
            }
          : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
    .returning();
  const captureStart =
    input.autoCaptureStart === undefined
      ? goals.autoCaptureStart
      : sql`${input.autoCaptureStart}::date`;
  const captureEnd =
    input.autoCaptureEnd === undefined ? goals.autoCaptureEnd : sql`${input.autoCaptureEnd}::date`;
  const status = input.status === undefined ? goals.status : sql`${input.status}`;
  const captureEnabled = sql`case when ${status} = 'completed' then false else ${input.autoCaptureEnabled === undefined ? goals.autoCaptureEnabled : sql`${input.autoCaptureEnabled}`} end`;
  const configurationGuard = batchAssert(
    db,
    sql`exists (
    select 1 from goals where id = ${id}::uuid and deleted_at is null
      and (not (${captureEnabled}) or (${captureStart} is not null and ${captureEnd} is not null))
      and (${captureStart} is null or ${captureEnd} is null or ${captureStart} <= ${captureEnd})
  )`,
    "goal_configuration_valid",
  );
  const queries = [
    ...goalReservationLockQueries(db, [id]),
    configurationGuard,
    update,
    ...(input.status === "completed"
      ? [
          db.execute(sql`insert into goal_reservation_movements (goal_id, account_id, type, amount, currency, note)
      select ${id}::uuid, account_id, 'release', sum(case when type in ('reserve','restore') then amount else -amount end), currency, 'Liberación al completar Goal'
      from goal_reservation_movements where goal_id = ${id}::uuid
        and exists (select 1 from goals where id = ${id}::uuid and deleted_at is null and status = 'completed')
      group by account_id, currency
      having sum(case when type in ('reserve','restore') then amount else -amount end) > 0`),
        ]
      : []),
  ];
  // Neon batch is one transaction. The row lock serializes all ledger writers;
  // each release is calculated in PostgreSQL from the remaining numeric balance.
  let results;
  try {
    results = await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) {
    if (isPgError(error, "22012"))
      throw conflictError("Goal settings changed concurrently; reload and try again");
    throw error;
  }
  const row = (results[2] as Array<typeof goals.$inferSelect>)[0];
  return row ? mapGoal(row, tagIds) : null;
}

export async function deleteGoal(db: Db, id: string) {
  const queries: unknown[] = [
    ...goalReservationLockQueries(db, [id]),
    db.update(budgets).set({ goalId: null, updatedAt: new Date() }).where(eq(budgets.goalId, id)),
    db
      .update(goals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(goals.id, id))
      .returning(),
    db.execute(sql`insert into goal_reservation_movements (goal_id, account_id, type, amount, currency, note)
      select ${id}::uuid, account_id, 'release', sum(case when type in ('reserve','restore') then amount else -amount end), currency, 'Liberación al archivar Goal'
      from goal_reservation_movements where goal_id = ${id}::uuid group by account_id, currency
      having sum(case when type in ('reserve','restore') then amount else -amount end) > 0`),
  ];
  const results = await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
  return (results[2] as unknown[]).length > 0;
}
