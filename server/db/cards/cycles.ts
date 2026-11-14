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
        coalesce((SELECT sum(amount_in_limit_currency) FROM credit_card_payments WHERE statement_id = s.id AND deleted_at IS NULL), 0) AS paid
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
  const cardRows = await db
    .select({ id: creditCards.id })
    .from(creditCards)
    .orderBy(creditCards.id);
  if (!cardRows.length) return;
  await db.batch([
    ...cardRows.map((card) => lockCreditCard(db, card.id)),
    ...cardRows.flatMap((card) => cardStatementSyncQueries(db, card.id)),
  ] as unknown as Parameters<Db["batch"]>[0]);
}

export async function listCreditCardStatements(db: Db, creditCardId: string) {
  const rows = await db
    .select()
    .from(creditCardStatements)
    .where(eq(creditCardStatements.creditCardId, creditCardId))
    .orderBy(desc(creditCardStatements.cycleEnd));
  return rows.map(mapCreditCardStatement);
}

/** Derived statement writes run after the financial write, inside its locked batch. */
export function cardStatementSyncQueries(db: Db, creditCardId: string, now = new Date()) {
  const monthEnd = (month: ReturnType<typeof sql>, day: ReturnType<typeof sql>) => sql`(
    ${month} + (least(${day}::int, extract(day from ${month} + interval '1 month' - interval '1 day')::int)-1)*interval '1 day'
    + interval '1 day' - interval '1 millisecond')`;
  const previousEnd = monthEnd(sql`closing_month - interval '1 month'`, sql`closing_day`);
  const cycleEnd = monthEnd(sql`closing_month`, sql`closing_day`);
  const due = monthEnd(
    sql`closing_month + CASE WHEN due_day > closing_day THEN interval '0 months' ELSE interval '1 month' END`,
    sql`due_day`,
  );
  const candidates = sql`WITH base AS (
    SELECT r.id,r.credit_card_id,c.closing_day,c.due_day,
      r.occurred_at AT TIME ZONE 'UTC' AS occurred_utc,
      date_trunc('month',r.occurred_at AT TIME ZONE 'UTC') AS month_start
    FROM credit_card_records r JOIN credit_cards c ON c.id=r.credit_card_id
    WHERE r.credit_card_id=${creditCardId}::uuid AND r.statement_id IS NULL AND r.deleted_at IS NULL
  ), closing AS (
    SELECT *,CASE WHEN occurred_utc > ${monthEnd(sql`month_start`, sql`closing_day`)}
      THEN month_start+interval '1 month' ELSE month_start END AS closing_month FROM base
  ), cycles AS (
    SELECT id,credit_card_id,(${previousEnd}+interval '1 millisecond') AT TIME ZONE 'UTC' AS cycle_start,
      ${cycleEnd} AT TIME ZONE 'UTC' AS cycle_end,${due} AT TIME ZONE 'UTC' AS due_at FROM closing
  ), closed AS (SELECT * FROM cycles WHERE cycle_end <= ${now.toISOString()}::timestamptz)`;
  return [
    db.execute(sql`${candidates}
      INSERT INTO credit_card_statements(credit_card_id,cycle_start,cycle_end,due_at,closed_at)
      SELECT DISTINCT credit_card_id,cycle_start,cycle_end,due_at,cycle_end FROM closed ON CONFLICT DO NOTHING`),
    db.execute(sql`${candidates}
      UPDATE credit_card_records r SET statement_id=s.id FROM closed c
      JOIN credit_card_statements s ON s.credit_card_id=c.credit_card_id AND s.cycle_start=c.cycle_start AND s.cycle_end=c.cycle_end
      WHERE r.id=c.id AND r.deleted_at IS NULL AND r.statement_id IS NULL`),
    refreshCreditCardStatements(db, creditCardId),
  ];
}
