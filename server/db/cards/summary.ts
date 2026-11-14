import { eq, sql } from "drizzle-orm";

import { creditCardCycleDates, dateKey } from "../../../shared/calculations.js";
import { mapCreditCard } from "../mappers.js";
import { creditCards } from "../schema.js";

import type { CreditCardCurrencyAmount, CreditCardSummary } from "../../../shared/types.js";
import type { Db } from "../input-types.js";

export async function getCreditCardSummary(
  db: Db,
  id: string,
  asOf = new Date(),
): Promise<CreditCardSummary | null> {
  const [row] = await db.select().from(creditCards).where(eq(creditCards.id, id)).limit(1);
  if (!row) return null;
  const card = mapCreditCard(row),
    dates = creditCardCycleDates(card, asOf);
  const result = await db.execute(sql`WITH movements AS (
   SELECT id,kind,original_record_id,statement_id,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,occurred_at
   FROM credit_card_records WHERE credit_card_id=${id}::uuid AND deleted_at IS NULL AND occurred_at<=${asOf.toISOString()}::timestamptz
   UNION ALL
   SELECT r.id,CASE WHEN r.type='income' THEN 'refund' ELSE 'purchase' END,NULL::uuid,NULL::uuid,r.amount,r.currency,
     coalesce(r.amount_in_limit_currency,r.amount*coalesce(r.exchange_rate_to_limit_currency,1)),coalesce(r.exchange_rate_to_limit_currency,1),r.occurred_at
   FROM records r WHERE r.credit_card_id=${id}::uuid AND r.deleted_at IS NULL AND r.payment_status<>'cancelled'
     AND r.occurred_at<=${asOf.toISOString()}::timestamptz
     AND (r.currency=${card.limitCurrency} OR r.amount_in_limit_currency>0 OR r.exchange_rate_to_limit_currency>0)
     AND NOT EXISTS (SELECT 1 FROM credit_card_records linked WHERE linked.wallet_record_id=r.id AND linked.credit_card_id=${id}::uuid AND linked.deleted_at IS NULL)
 ), payments AS (
   SELECT p.*,coalesce((SELECT sum(a.amount_in_limit_currency) FROM credit_card_payment_allocations a WHERE a.payment_id=p.id),p.amount_in_limit_currency) AS allocated
   FROM credit_card_payments p WHERE p.credit_card_id=${id}::uuid AND p.deleted_at IS NULL AND p.occurred_at<=${asOf.toISOString()}::timestamptz
 ), pools AS (SELECT statement_id,sum(allocated) AS amount FROM payments GROUP BY statement_id),
 net AS (
   SELECT p.*,greatest(0,p.amount_in_limit_currency-coalesce((SELECT sum(r.amount_in_limit_currency) FROM movements r WHERE r.kind='refund' AND r.original_record_id=p.id),0)) AS net
   FROM movements p WHERE p.kind='purchase'
 ), ordered AS (
   SELECT *,coalesce(sum(net) OVER (PARTITION BY statement_id ORDER BY occurred_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior FROM net
 ), remaining AS (
   SELECT p.*,greatest(0,p.net-least(p.net,greatest(0,coalesce(pool.amount,0)-p.prior)))/p.exchange_rate_to_limit_currency AS remaining
   FROM ordered p LEFT JOIN pools pool ON pool.statement_id IS NOT DISTINCT FROM p.statement_id
 ), outstanding_values AS (
   SELECT currency,remaining AS amount FROM remaining UNION ALL
   SELECT currency,-amount FROM movements WHERE kind='refund' AND original_record_id IS NULL
 ), outstanding AS (SELECT currency,sum(amount) AS amount FROM outstanding_values GROUP BY currency HAVING sum(amount)>0.000001),
 current_cycle AS (
   SELECT currency,sum(CASE WHEN kind='refund' THEN -amount ELSE amount END) AS amount FROM movements
   WHERE occurred_at>=${dates.currentCycleStart.toISOString()}::timestamptz AND occurred_at<=${dates.currentCycleEnd.toISOString()}::timestamptz
   GROUP BY currency HAVING sum(CASE WHEN kind='refund' THEN -amount ELSE amount END)>0.000001
 ), statement_due AS (
   SELECT currency,sum(remaining) AS amount FROM remaining WHERE occurred_at<=${dates.lastClosingDate.toISOString()}::timestamptz
   GROUP BY currency HAVING sum(remaining)>0.000001
 ) SELECT
   greatest(0,coalesce((SELECT sum(CASE WHEN kind='refund' THEN -amount_in_limit_currency ELSE amount_in_limit_currency END) FROM movements),0)-coalesce((SELECT sum(amount_in_limit_currency) FROM payments),0)) AS used,
   EXISTS(SELECT 1 FROM payments) AS has_payments,
   coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) ORDER BY currency) FROM outstanding),'[]'::jsonb) AS outstanding,
   coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) ORDER BY currency) FROM current_cycle),'[]'::jsonb) AS current_cycle,
   coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) ORDER BY currency) FROM statement_due),'[]'::jsonb) AS statement_due`);
  const data = result.rows[0] as {
    used: string;
    has_payments: boolean;
    outstanding: CreditCardCurrencyAmount[];
    current_cycle: CreditCardCurrencyAmount[];
    statement_due: CreditCardCurrencyAmount[];
  };
  const usedLimit = Number(data.used),
    hasDue = data.statement_due.length > 0;
  return {
    card,
    usedLimit,
    availableLimit: card.creditLimit - usedLimit,
    utilizationPercent: card.creditLimit > 0 ? (usedLimit / card.creditLimit) * 100 : 0,
    currentCycleStart: dates.currentCycleStart.toISOString().slice(0, 10),
    currentCycleEnd: dateKey(dates.currentCycleEnd),
    lastClosingDate: dateKey(dates.lastClosingDate),
    dueDate: dateKey(dates.dueDate),
    currentCycle: data.current_cycle,
    outstanding: data.outstanding,
    statementDue: data.statement_due,
    status:
      usedLimit > card.creditLimit
        ? "over_limit"
        : hasDue && asOf > dates.dueDate
          ? "overdue"
          : hasDue && data.has_payments
            ? "partial"
            : "ok",
  };
}
