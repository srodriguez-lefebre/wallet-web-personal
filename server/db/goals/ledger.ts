import { sql } from "drizzle-orm";

import { lockRows } from "../batch.js";
import { asNumber, asRequiredIso } from "../mappers.js";
import { goalReservationMovements, goals } from "../schema.js";

import type { GoalReservation } from "../../../shared/types.js";
import type { Db, ReservationMovementWrite } from "../input-types.js";

export function goalReservationBalancesQuery(db: Db) {
  const movement = goalReservationMovements;
  const amount = sql<string>`sum(case when ${movement.type} in ('reserve','restore') then ${movement.amount} else -${movement.amount} end)`;
  return db
    .select({
      id: sql<string>`(array_agg(${movement.id} order by ${movement.createdAt} desc, ${movement.id} desc))[1]`,
      goalId: movement.goalId,
      accountId: movement.accountId,
      currency: movement.currency,
      amount,
      createdAt: sql<string>`max(${movement.createdAt})::text`,
    })
    .from(movement)
    .groupBy(movement.goalId, movement.accountId, movement.currency)
    .having(sql`${amount} > 0.005`)
    .orderBy(
      sql`max(${movement.createdAt}) desc`,
      movement.goalId,
      movement.accountId,
      movement.currency,
    );
}

export function mapGoalReservationBalance(
  row: Awaited<ReturnType<typeof goalReservationBalancesQuery>>[number],
): GoalReservation {
  return {
    id: row.id,
    goalId: row.goalId,
    accountId: row.accountId,
    amount: asNumber(row.amount),
    currency: row.currency as GoalReservation["currency"],
    createdAt: asRequiredIso(row.createdAt),
    note: "Saldo reservado",
  };
}

// Neon HTTP has no interactive transactions. Acquire these locks first in the
// same batch as every ledger change; subsequent statements get a fresh snapshot.
export function goalReservationLockQueries(db: Db, goalIds: string[]) {
  return lockRows(db, goals, goalIds);
}

export function reservationBalanceSql(goalId: string, accountId: string, currency: string) {
  return sql`coalesce((select sum(case when type in ('reserve', 'restore') then amount else -amount end)
    from goal_reservation_movements where goal_id = ${goalId}::uuid and account_id = ${accountId}::uuid and currency = ${currency}), 0)`;
}

export function recordReservationWriteQueries(db: Db, values: ReservationMovementWrite[]) {
  return values.map((movement) => {
    const balance = reservationBalanceSql(movement.goalId, movement.accountId, movement.currency);
    const amount =
      movement.type === "consume"
        ? sql`least(${movement.amount}::numeric, greatest(0, ${balance}))`
        : sql`${movement.amount}::numeric`;
    return db.execute(sql`insert into goal_reservation_movements
      (goal_id, account_id, type, amount, currency, record_id, idempotency_key, note)
      select ${movement.goalId}::uuid, ${movement.accountId}::uuid, ${movement.type}, ${amount},
        ${movement.currency}, ${movement.recordId ?? null}::uuid, ${movement.idempotencyKey ?? null}, ${movement.note ?? null}
      where ${amount} > 0 and exists (select 1 from goals where id = ${movement.goalId}::uuid and deleted_at is null and status <> 'completed')
        and exists (select 1 from record_goals where record_id = ${movement.recordId ?? null}::uuid and goal_id = ${movement.goalId}::uuid)`);
  });
}
