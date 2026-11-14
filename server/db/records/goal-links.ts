import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { isFinancialRecord } from "../../../shared/record-status.js";
import { validationError } from "../../api/errors.js";
import { getExchangeRate } from "../fx.js";
import {
  goalReservationLockQueries,
  recordReservationWriteQueries,
  reservationBalanceSql,
} from "../goals/ledger.js";
import { toNumeric } from "../mappers.js";
import { accounts, goalReservationMovements, goals } from "../schema.js";

import type { Account, RecordGoalAssociation } from "../../../shared/types.js";
import type { Db, NewRecord, ReservationMovementWrite } from "../input-types.js";

export function requestedGoalAssociations(input: NewRecord): RecordGoalAssociation[] {
  const explicit = input.goalAssociations ?? [];
  if (explicit.length) return explicit;
  return (input.goalIds ?? []).map((goalId) => ({
    goalId,
    assignmentSource: "manual" as const,
    useReserved: true,
    reserveIncome: true,
  }));
}

export function recordGoalWriteQueries(
  db: Db,
  recordId: string,
  input: NewRecord,
  associations: RecordGoalAssociation[],
  preservedAutomaticGoalIds = new Set<string>(),
) {
  return associations.map((association) => {
    const automatic =
      association.assignmentSource === "date_rule" &&
      !preservedAutomaticGoalIds.has(association.goalId);
    const eligible = automatic
      ? sql`exists (select 1 from goals where id = ${association.goalId}::uuid
      and deleted_at is null and status = 'active' and auto_capture_enabled = true
      and auto_capture_start <= ${input.occurredAt.slice(0, 10)}::date
      and auto_capture_end >= ${input.occurredAt.slice(0, 10)}::date)`
      : sql`true`;
    return db.execute(sql`insert into record_goals (record_id,goal_id,assignment_source,use_reserved,reserve_income,allocated_amount)
      select ${recordId}::uuid, ${association.goalId}::uuid, ${association.assignmentSource ?? "manual"},
        ${association.useReserved ?? true}, ${association.reserveIncome ?? true},
        ${association.allocatedAmount === undefined ? null : toNumeric(association.allocatedAmount)}::numeric
      where ${eligible}`);
  });
}

export async function resolveGoalAssociations(
  db: Db,
  input: NewRecord,
  preservedGoalIds = new Set<string>(),
  captureAutomatic = true,
) {
  const associations = new Map(
    requestedGoalAssociations(input).map((association) => [association.goalId, association]),
  );
  for (const association of associations.values()) {
    if (association.allocatedAmount !== undefined && association.allocatedAmount > input.amount) {
      throw validationError("Goal allocation cannot exceed the record amount");
    }
  }
  if (associations.size) {
    const selectedGoals = await db
      .select()
      .from(goals)
      .where(inArray(goals.id, [...associations.keys()]));
    if (
      selectedGoals.length !== associations.size ||
      selectedGoals.some(
        (goal) => !preservedGoalIds.has(goal.id) && (goal.deletedAt || goal.status !== "active"),
      )
    ) {
      throw validationError("New records can only be associated with active goals");
    }
  }
  if (captureAutomatic && input.type === "expense") {
    const date = input.occurredAt.slice(0, 10);
    const automaticGoals = await db
      .select()
      .from(goals)
      .where(
        and(
          isNull(goals.deletedAt),
          eq(goals.status, "active"),
          eq(goals.autoCaptureEnabled, true),
          sql`${goals.autoCaptureStart} <= ${date}`,
          sql`${goals.autoCaptureEnd} >= ${date}`,
        ),
      );
    for (const goal of automaticGoals) {
      if (!associations.has(goal.id))
        associations.set(goal.id, {
          goalId: goal.id,
          assignmentSource: "date_rule",
          useReserved: true,
          reserveIncome: true,
        });
    }
  }
  return [...associations.values()];
}

export async function buildRecordReservationMovements(
  db: Db,
  recordId: string,
  input: NewRecord,
  associations: RecordGoalAssociation[],
  unresolvedAutomatic?: {
    goalIds: Set<string>;
    warnings: string[];
    preservedGoalIds?: Set<string>;
  },
) {
  if (!isFinancialRecord(input) || input.type === "transfer" || associations.length === 0)
    return [];
  const goalRows = await db
    .select()
    .from(goals)
    .where(
      inArray(
        goals.id,
        associations.map((item) => item.goalId),
      ),
    );
  const accountRows = await db.select().from(accounts);
  const values: ReservationMovementWrite[] = [];
  for (const association of associations) {
    if (
      (input.type === "expense" && !association.useReserved) ||
      (input.type === "income" && !association.reserveIncome)
    )
      continue;
    const goal = goalRows.find((item) => item.id === association.goalId);
    if (!goal || goal.deletedAt || goal.status === "completed") continue;
    const accountId = input.accountId ?? goal.autoReservationAccountId;
    const account = accountRows.find((item) => item.id === accountId);
    if (!accountId || !account) continue;
    const rate = await getExchangeRate(
      db,
      input.currency,
      account.currency as Account["currency"],
      input.occurredAt,
    );
    const fullRecordAmount =
      input.accountId === accountId && input.accountAmount !== undefined
        ? sql`${toNumeric(input.accountAmount)}::numeric`
        : rate !== null
          ? sql`(${toNumeric(input.amount)}::numeric * ${toNumeric(rate)}::numeric)`
          : undefined;
    if (fullRecordAmount === undefined) {
      if (
        unresolvedAutomatic &&
        association.assignmentSource === "date_rule" &&
        !unresolvedAutomatic.preservedGoalIds?.has(association.goalId)
      ) {
        unresolvedAutomatic.goalIds.add(association.goalId);
        unresolvedAutomatic.warnings.push(
          `${goal.name}: automatic capture skipped because reservation currency conversion is unavailable.`,
        );
        continue;
      }
      throw validationError(
        "A dated exchange rate is required for the reservation account currency",
      );
    }
    const recordAmount =
      association.allocatedAmount === undefined
        ? fullRecordAmount
        : sql`(${fullRecordAmount} * ${toNumeric(association.allocatedAmount)}::numeric / ${toNumeric(input.amount)}::numeric)`;
    if (input.type === "expense" && association.useReserved) {
      values.push({
        goalId: association.goalId,
        accountId,
        type: "consume",
        amount: recordAmount,
        currency: account.currency,
        recordId,
        idempotencyKey: `${recordId}:${association.goalId}:consume`,
        note: "Consumo de reserva por Record",
      });
    }
    if (input.type === "income" && association.reserveIncome) {
      values.push({
        goalId: association.goalId,
        accountId,
        type: "reserve",
        amount: recordAmount,
        currency: account.currency,
        recordId,
        idempotencyKey: `${recordId}:${association.goalId}:income-reserve`,
        note: "Ingreso vuelto a reservar",
      });
    }
  }
  return values;
}

export async function prepareRecordGoalWrites(db: Db, recordId: string, input: NewRecord) {
  const resolved = await resolveGoalAssociations(db, input);
  const unresolvedAutomatic = { goalIds: new Set<string>(), warnings: [] as string[] };
  const movements = await buildRecordReservationMovements(
    db,
    recordId,
    input,
    resolved,
    unresolvedAutomatic,
  );
  const associations = resolved.filter((item) => !unresolvedAutomatic.goalIds.has(item.goalId));
  return {
    associations,
    warnings: unresolvedAutomatic.warnings,
    lockQueries: goalReservationLockQueries(
      db,
      associations.map((item) => item.goalId),
    ),
    queries: [
      ...recordGoalWriteQueries(db, recordId, input, associations),
      ...recordReservationWriteQueries(db, movements),
    ],
  };
}

export async function buildRecordMovementCompensations(db: Db, recordId: string) {
  const rows = await db
    .select()
    .from(goalReservationMovements)
    .where(eq(goalReservationMovements.recordId, recordId));
  const net = new Map<
    string,
    {
      goalId: string;
      accountId: string;
      currency: string;
    }
  >();
  for (const row of rows) {
    const key = `${row.goalId}:${row.accountId}:${row.currency}`;
    net.set(key, { goalId: row.goalId, accountId: row.accountId, currency: row.currency });
  }
  return {
    goalIds: [...net.values()].map((item) => item.goalId),
    queries: [...net.values()].map((item) => {
      const balance = reservationBalanceSql(item.goalId, item.accountId, item.currency);
      return db.execute(sql`insert into goal_reservation_movements
        (goal_id, account_id, type, amount, currency, record_id, idempotency_key, note)
        select ${item.goalId}::uuid, ${item.accountId}::uuid,
          case when net > 0 then 'release' else 'restore' end,
          case when net > 0 and net > ${balance} then abs(net) / 0::numeric else abs(net) end,
          ${item.currency}, ${recordId}::uuid, ${`${recordId}:reconcile:${randomUUID()}`}, 'Reconciliación de Record'
        from (select coalesce(sum(case when type in ('reserve','restore') then amount else -amount end),0) as net
          from goal_reservation_movements where record_id = ${recordId}::uuid and goal_id = ${item.goalId}::uuid
            and account_id = ${item.accountId}::uuid and currency = ${item.currency}) ledger
        where net <> 0 and exists (select 1 from goals where id = ${item.goalId}::uuid and deleted_at is null and status <> 'completed')`);
    }),
  };
}
