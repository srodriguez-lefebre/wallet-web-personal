import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { validationError } from "../../api/errors.js";
import {
  asNumber,
  asRequiredIso,
  mapGoalReservationMovement,
  nullToUndefined,
  toNumeric,
} from "../mappers.js";
import { goalReservationMovements } from "../schema.js";
import {
  goalReservationBalancesQuery,
  goalReservationLockQueries,
  mapGoalReservationBalance,
  reservationBalanceSql,
} from "./ledger.js";

import type { GoalReservation } from "../../../shared/types.js";
import type { Db, NewGoalReservation } from "../input-types.js";

export async function createGoalReservation(db: Db, input: NewGoalReservation) {
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw validationError("Reservation amount must be positive");
  const movementId = randomUUID();
  const results = await db.batch([
    ...goalReservationLockQueries(db, [input.goalId]),
    db.execute(sql`insert into goal_reservation_movements (id,goal_id,account_id,amount,currency,type,created_at,note)
      select ${movementId}::uuid, ${input.goalId}::uuid, ${input.accountId}::uuid, ${toNumeric(input.amount)}::numeric,
        ${input.currency}, 'reserve', ${new Date(input.createdAt).toISOString()}::timestamptz, ${input.note ?? null}
      where exists (select 1 from goals where id = ${input.goalId}::uuid and deleted_at is null and status = 'active')
        and exists (select 1 from accounts where id = ${input.accountId}::uuid and currency = ${input.currency} and deleted_at is null)`),
    db.select().from(goalReservationMovements).where(eq(goalReservationMovements.id, movementId)),
  ] as unknown as Parameters<Db["batch"]>[0]);
  const row = (results[2] as Array<typeof goalReservationMovements.$inferSelect>)[0];
  if (!row) throw validationError("Reservations require an active goal and the account currency");
  return {
    id: row.id,
    goalId: row.goalId,
    accountId: row.accountId,
    amount: asNumber(row.amount),
    currency: row.currency as GoalReservation["currency"],
    createdAt: asRequiredIso(row.createdAt),
    note: nullToUndefined(row.note),
  };
}

export async function listGoalReservations(db: Db) {
  return (await goalReservationBalancesQuery(db)).map(mapGoalReservationBalance);
}

export async function deleteGoalReservation(db: Db, id: string) {
  const [movement] = await db
    .select()
    .from(goalReservationMovements)
    .where(eq(goalReservationMovements.id, id))
    .limit(1);
  if (!movement) return false;
  const balance = reservationBalanceSql(movement.goalId, movement.accountId, movement.currency);
  const results = await db.batch([
    ...goalReservationLockQueries(db, [movement.goalId]),
    db.execute(sql`insert into goal_reservation_movements (goal_id,account_id,type,amount,currency,note)
      select ${movement.goalId}::uuid, ${movement.accountId}::uuid, 'release', ${balance}, ${movement.currency}, 'Liberación total'
      where ${balance} > 0 returning id`),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return Boolean(
    (
      results[1] as {
        rows: unknown[];
      }
    ).rows.length,
  );
}

export async function releaseGoalReservation(
  db: Db,
  input: {
    goalId: string;
    accountId: string;
    amount: number;
    note?: string;
  },
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw validationError("Release amount must be positive");
  const movementId = randomUUID();
  const results = await db.batch([
    ...goalReservationLockQueries(db, [input.goalId]),
    db.execute(sql`insert into goal_reservation_movements (id,goal_id,account_id,type,amount,currency,note)
      select ${movementId}::uuid, ${input.goalId}::uuid, ${input.accountId}::uuid, 'release', ${toNumeric(input.amount)}::numeric, currency, ${input.note ?? "Liberación parcial"}
      from goal_reservation_movements where goal_id = ${input.goalId}::uuid and account_id = ${input.accountId}::uuid group by currency
      having sum(case when type in ('reserve','restore') then amount else -amount end) >= ${toNumeric(input.amount)}::numeric`),
    db.select().from(goalReservationMovements).where(eq(goalReservationMovements.id, movementId)),
  ] as unknown as Parameters<Db["batch"]>[0]);
  const row = (results[2] as Array<typeof goalReservationMovements.$inferSelect>)[0];
  if (!row) throw validationError("Release exceeds the reserved balance");
  return mapGoalReservationMovement(row);
}
