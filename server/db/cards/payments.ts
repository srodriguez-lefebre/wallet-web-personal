import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { conflictError, validationError } from "../../api/errors.js";
import { mapCreditCardPayment, toNumeric } from "../mappers.js";
import { isPgError } from "../pg-error.js";
import { creditCardPayments } from "../schema.js";
import { refreshCreditCardStatements } from "./cycles.js";
import { lockCreditCard } from "./guards.js";

import type { Db, NewCreditCardPayment } from "../input-types.js";

export async function createCreditCardPayment(
  db: Db,
  creditCardId: string,
  input: NewCreditCardPayment,
) {
  if (!input.statementId) throw validationError("Select a statement before making a card payment");
  return payCreditCardStatement(db, creditCardId, input.statementId, input);
}

export async function payCreditCardStatement(
  db: Db,
  creditCardId: string,
  statementId: string,
  input: NewCreditCardPayment,
) {
  const paymentId = randomUUID();
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        creditCardId,
        statementId,
        amount: input.amount,
        currency: input.currency,
        amountInLimitCurrency: input.amountInLimitCurrency,
        accountId: input.accountId ?? null,
        accountAmount: input.accountAmount ?? null,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
      }),
    )
    .digest("hex");
  // The first query acquires the card lock. The following query gets a fresh
  // READ COMMITTED snapshot after any concurrent payment has committed.
  let result;
  try {
    const batch = await db.batch([
      lockCreditCard(db, creditCardId),
      db.execute(sql`SELECT 1 / CASE WHEN NOT EXISTS (
        SELECT 1 FROM credit_card_payments WHERE idempotency_key = ${idempotencyKey} AND request_hash IS DISTINCT FROM ${requestHash}
      ) THEN 1 ELSE 0 END AS valid`),
      db.execute(sql`
      WITH net_purchases AS (
        SELECT p.*, greatest(0, p.amount_in_limit_currency - coalesce((
          SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
          WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL
        ), 0)) AS net
        FROM credit_card_records p
        WHERE p.credit_card_id = ${creditCardId} AND p.statement_id = ${statementId}
          AND p.kind = 'purchase' AND p.deleted_at IS NULL
      ), totals AS (
        SELECT coalesce((SELECT sum(net) FROM net_purchases), 0) AS total,
          coalesce((SELECT sum(amount_in_limit_currency) FROM credit_card_payments
            WHERE credit_card_id = ${creditCardId} AND statement_id = ${statementId}), 0) AS paid
      ), ordered AS (
        SELECT p.*, coalesce(sum(net) OVER (ORDER BY occurred_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior
        FROM net_purchases p
      ), drafts AS (
        SELECT p.*, least(net, greatest(0, t.paid + round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) - prior))
          - least(net, greatest(0, t.paid - prior)) AS allocated
        FROM ordered p CROSS JOIN totals t
      ), payment AS (
        INSERT INTO credit_card_payments
          (id, credit_card_id, statement_id, amount, currency, amount_in_limit_currency, account_id, account_amount, occurred_at, note, idempotency_key, request_hash)
        SELECT ${paymentId}::uuid, ${creditCardId}::uuid, s.id,
          ${toNumeric(input.amount)}::numeric, ${input.currency}, round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2),
          CASE WHEN ${input.accountId ?? null}::uuid IS NOT NULL AND coalesce((SELECT sum(allocated) FROM drafts WHERE NOT account_impact_at_creation), 0) > 0
            THEN ${input.accountId ?? null}::uuid END,
          CASE WHEN ${input.accountId ?? null}::uuid IS NOT NULL AND coalesce((SELECT sum(allocated) FROM drafts WHERE NOT account_impact_at_creation), 0) > 0
            THEN ${input.accountAmount === undefined ? null : toNumeric(input.accountAmount)}::numeric
              * (SELECT sum(allocated) FROM drafts WHERE NOT account_impact_at_creation)
              / round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) END,
          ${input.occurredAt}::timestamptz, ${input.note ?? null}, ${idempotencyKey}, ${requestHash}
        FROM credit_card_statements s CROSS JOIN totals t
        WHERE s.id = ${statementId}::uuid AND s.credit_card_id = ${creditCardId}::uuid
          AND round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) > 0
          AND round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) <= greatest(0, t.total - t.paid)
          AND NOT EXISTS (SELECT 1 FROM credit_card_payments WHERE idempotency_key = ${idempotencyKey})
        RETURNING id, statement_id
      ), allocations AS (
        INSERT INTO credit_card_payment_allocations
          (payment_id, credit_card_record_id, amount, amount_in_limit_currency)
        SELECT payment.id, d.id, d.allocated / d.exchange_rate_to_limit_currency, d.allocated
        FROM drafts d CROSS JOIN payment WHERE d.allocated > 0 RETURNING id
      ), status_update AS (
        UPDATE credit_card_statements s SET
          status = CASE WHEN t.total - t.paid - round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) <= 0 THEN 'paid'
            WHEN s.due_at < now() THEN 'overdue' ELSE 'partial' END,
          paid_at = CASE WHEN t.total - t.paid - round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) <= 0 THEN ${input.occurredAt}::timestamptz ELSE NULL END,
          updated_at = now()
        FROM totals t, payment WHERE s.id = payment.statement_id RETURNING s.id
      ) SELECT id FROM payment UNION ALL
        SELECT id FROM credit_card_payments WHERE idempotency_key = ${idempotencyKey} AND request_hash = ${requestHash}
    `),
    ]);
    result = batch[2];
  } catch (error) {
    if (isPgError(error, "22012") || isPgError(error, "23505"))
      throw conflictError("Payment key was already used with different details");
    throw error;
  }
  if (!result.rows.length)
    throw validationError("Payment exceeds statement balance or statement not found");
  const [payment] = await db
    .select()
    .from(creditCardPayments)
    .where(eq(creditCardPayments.id, String(result.rows[0]!.id)));
  return mapCreditCardPayment(payment);
}

export async function deleteCreditCardPayment(db: Db, creditCardId: string, paymentId: string) {
  const [payment] = await db
    .select()
    .from(creditCardPayments)
    .where(
      and(eq(creditCardPayments.id, paymentId), eq(creditCardPayments.creditCardId, creditCardId)),
    )
    .limit(1);
  if (!payment) return false;
  const [, deleted] = await db.batch([
    lockCreditCard(db, creditCardId),
    db
      .delete(creditCardPayments)
      .where(
        and(
          eq(creditCardPayments.id, paymentId),
          eq(creditCardPayments.creditCardId, creditCardId),
        ),
      )
      .returning({ id: creditCardPayments.id }),
    refreshCreditCardStatements(db, creditCardId),
  ]);
  if (!deleted.length) return false;
  return true;
}
