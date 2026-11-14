import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { validationError } from "../../api/errors.js";
import { mapCreditCard, mapCreditCardStatement } from "../mappers.js";
import { creditCardRecords, creditCards, creditCardStatements } from "../schema.js";
import { lockCreditCard } from "./guards.js";

import type { CreditCard } from "../../../shared/types.js";
import type { Db } from "../input-types.js";

// All card mutations use the same lock and refresh balances in their atomic batch.
export function refreshCreditCardStatements(db: Db, creditCardId?: string) {
  return db.execute(sql`
    WITH balances AS (
      SELECT s.id, s.due_at,
        coalesce((SELECT sum(p.amount_in_limit_currency - coalesce((
          SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
          WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL
        ), 0)) FROM credit_card_records p
          WHERE p.statement_id = s.id AND p.kind = 'purchase' AND p.deleted_at IS NULL), 0) AS total,
        coalesce((SELECT sum(amount_in_limit_currency) FROM credit_card_payments WHERE statement_id = s.id), 0) AS paid
      FROM credit_card_statements s ${creditCardId ? sql`WHERE s.credit_card_id = ${creditCardId}` : sql``}
    ) UPDATE credit_card_statements s SET
      status = CASE WHEN b.total - b.paid <= 0 THEN 'paid' WHEN b.due_at < now() THEN 'overdue'
        WHEN b.paid > 0 THEN 'partial' ELSE 'pending' END,
      paid_at = CASE WHEN b.total - b.paid <= 0 THEN coalesce(s.paid_at, now()) ELSE NULL END,
      updated_at = now()
    FROM balances b WHERE s.id = b.id
  `);
}

export async function creditCardCycleQueries(
  db: Db,
  creditCardId: string,
  recordId: string,
  occurredAt: string,
) {
  const [card] = await db.select().from(creditCards).where(eq(creditCards.id, creditCardId));
  if (!card) throw validationError("Card not found");
  const cycle = cardCycle(mapCreditCard(card), new Date(occurredAt));
  const sameMovement = and(
    eq(creditCardRecords.id, recordId),
    eq(creditCardRecords.occurredAt, new Date(occurredAt)),
    isNull(creditCardRecords.deletedAt),
  );
  if (cycle.cycleEnd > new Date())
    return [db.update(creditCardRecords).set({ statementId: null }).where(sameMovement)];
  return [
    db
      .insert(creditCardStatements)
      .values({ creditCardId, ...cycle, closedAt: cycle.cycleEnd })
      .onConflictDoNothing(),
    db
      .update(creditCardRecords)
      .set({
        statementId: sql`(SELECT id FROM credit_card_statements WHERE credit_card_id = ${creditCardId} AND cycle_start = ${cycle.cycleStart.toISOString()}::timestamptz AND cycle_end = ${cycle.cycleEnd.toISOString()}::timestamptz)`,
      })
      .where(sameMovement),
  ];
}

export function dayInMonth(year: number, month: number, day: number) {
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
      23,
      59,
      59,
      999,
    ),
  );
}

export function cardCycle(card: CreditCard, occurredAt: Date) {
  const year = occurredAt.getUTCFullYear();
  const month = occurredAt.getUTCMonth();
  let cycleEnd = dayInMonth(year, month, card.closingDay);
  if (occurredAt > cycleEnd) cycleEnd = dayInMonth(year, month + 1, card.closingDay);
  const previousEnd = dayInMonth(
    cycleEnd.getUTCFullYear(),
    cycleEnd.getUTCMonth() - 1,
    card.closingDay,
  );
  const cycleStart = new Date(previousEnd.getTime() + 1);
  const dueMonth =
    card.dueDay > card.closingDay ? cycleEnd.getUTCMonth() : cycleEnd.getUTCMonth() + 1;
  const dueAt = dayInMonth(cycleEnd.getUTCFullYear(), dueMonth, card.dueDay);
  return { cycleStart, cycleEnd, dueAt };
}

export async function ensureCreditCardStatements(db: Db) {
  const [cardRows, movementRows] = await db.batch([
    db.select().from(creditCards),
    db
      .select()
      .from(creditCardRecords)
      .where(and(isNull(creditCardRecords.deletedAt), isNull(creditCardRecords.statementId))),
  ]);
  for (const movement of movementRows) {
    const card = cardRows.find((card) => card.id === movement.creditCardId);
    if (!card || cardCycle(mapCreditCard(card), movement.occurredAt).cycleEnd > new Date())
      continue;
    const queries = await creditCardCycleQueries(
      db,
      movement.creditCardId,
      movement.id,
      movement.occurredAt.toISOString(),
    );
    await db.batch([
      lockCreditCard(db, movement.creditCardId),
      ...queries,
      refreshCreditCardStatements(db, movement.creditCardId),
    ]);
  }
  // Status is derived from current balances, including retroactive wallet activity.
  // Serialize this refresh with every card payment and refund.
  for (const card of cardRows)
    await db.batch([lockCreditCard(db, card.id), refreshCreditCardStatements(db, card.id)]);
}

export async function listCreditCardStatements(db: Db, creditCardId: string) {
  await ensureCreditCardStatements(db);
  const rows = await db
    .select()
    .from(creditCardStatements)
    .where(eq(creditCardStatements.creditCardId, creditCardId))
    .orderBy(desc(creditCardStatements.cycleEnd));
  return rows.map(mapCreditCardStatement);
}
