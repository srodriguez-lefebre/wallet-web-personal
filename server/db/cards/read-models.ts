import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import {
  cardAgendaSchema,
  cardCategoryUsageSchema,
  cardLedgerSchema,
  type CardAgendaQuery,
} from "../../../shared/card-read-contract.js";
import { namedBatch } from "../batch.js";
import {
  mapCreditCardPayment,
  mapCreditCardPaymentAllocation,
  mapCreditCardRecord,
  mapCreditCardStatement,
} from "../mappers.js";
import {
  creditCardPaymentAllocations,
  creditCardPayments,
  creditCardRecords,
  creditCardStatements,
} from "../schema.js";

import type { Db } from "../input-types.js";

const iso = (column: SQL) =>
  sql`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** One read aggregates statement debt and FIFO original-currency balances at the requested instant. */
export async function getCardStatementAgenda(db: Db, query: CardAgendaQuery, now: Date) {
  const rows = await db.execute(sql`WITH movements AS (
    SELECT * FROM credit_card_records WHERE deleted_at IS NULL AND occurred_at<=${now.toISOString()}::timestamptz
  ), payments AS (
    SELECT p.*,coalesce((SELECT sum(a.amount_in_limit_currency) FROM credit_card_payment_allocations a WHERE a.payment_id=p.id),p.amount_in_limit_currency) AS allocated
    FROM credit_card_payments p WHERE p.deleted_at IS NULL AND p.occurred_at<=${now.toISOString()}::timestamptz
  ), pools AS (SELECT credit_card_id,statement_id,sum(allocated) AS amount FROM payments GROUP BY credit_card_id,statement_id),
  net AS (
    SELECT p.*,greatest(0,p.amount_in_limit_currency-coalesce((SELECT sum(r.amount_in_limit_currency) FROM movements r WHERE r.kind='refund' AND r.original_record_id=p.id AND r.credit_card_id=p.credit_card_id),0)) AS net
    FROM movements p WHERE p.kind='purchase'
  ), ordered AS (
    SELECT *,coalesce(sum(net) OVER(PARTITION BY credit_card_id,statement_id ORDER BY occurred_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior FROM net
  ), remaining AS (
    SELECT p.credit_card_id,p.statement_id,p.currency,greatest(0,p.net-least(p.net,greatest(0,coalesce(pool.amount,0)-p.prior)))/nullif(p.exchange_rate_to_limit_currency,0) AS amount
    FROM ordered p LEFT JOIN pools pool ON pool.credit_card_id=p.credit_card_id AND pool.statement_id IS NOT DISTINCT FROM p.statement_id
  ), breakdown AS (
    SELECT credit_card_id,statement_id,currency,sum(amount) AS amount FROM remaining GROUP BY credit_card_id,statement_id,currency HAVING sum(amount)>0.000001
  ), statement_totals AS (
    SELECT p.credit_card_id,p.statement_id,sum(p.amount_in_limit_currency) AS purchases,
      sum(coalesce((SELECT sum(r.amount_in_limit_currency) FROM movements r WHERE r.kind='refund' AND r.original_record_id=p.id AND r.credit_card_id=p.credit_card_id),0)) AS refunds
    FROM movements p WHERE p.kind='purchase' GROUP BY p.credit_card_id,p.statement_id
  ), statement_payments AS (
    SELECT credit_card_id,statement_id,sum(amount_in_limit_currency) AS paid FROM payments GROUP BY credit_card_id,statement_id
  ), balances AS (
    SELECT s.*,greatest(0,coalesce(t.purchases,0)-coalesce(t.refunds,0)) AS total,coalesce(p.paid,0) AS paid,
      ((s.due_at AT TIME ZONE ${query.timeZone})::date-(${now.toISOString()}::timestamptz AT TIME ZONE ${query.timeZone})::date)::int AS days
    FROM credit_card_statements s LEFT JOIN statement_totals t ON t.credit_card_id=s.credit_card_id AND t.statement_id=s.id
    LEFT JOIN statement_payments p ON p.credit_card_id=s.credit_card_id AND p.statement_id=s.id
    WHERE s.closed_at<=${now.toISOString()}::timestamptz
  ) SELECT coalesce(jsonb_agg(jsonb_build_object(
    'card',jsonb_strip_nulls(jsonb_build_object('id',c.id,'name',c.name,'issuer',c.issuer,'lastFour',c.last_four,'creditLimit',c.credit_limit,'limitCurrency',c.limit_currency,'closingDay',c.closing_day,'dueDay',c.due_day,'color',c.color,'icon',c.icon,'isActive',c.is_active AND c.deleted_at IS NULL,'note',c.note)),
    'statement',jsonb_strip_nulls(jsonb_build_object('id',b.id,'creditCardId',b.credit_card_id,'cycleStart',${iso(sql`b.cycle_start`)},'cycleEnd',${iso(sql`b.cycle_end`)},'dueAt',${iso(sql`b.due_at`)},'status',b.status,'closedAt',${iso(sql`b.closed_at`)},'paidAt',${iso(sql`b.paid_at`)})),
    'totalAmountInLimitCurrency',b.total,'paidAmountInLimitCurrency',b.paid,'dueAmountInLimitCurrency',greatest(0,b.total-b.paid),
    'currencyBreakdown',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) ORDER BY currency) FROM breakdown d WHERE d.credit_card_id=b.credit_card_id AND d.statement_id=b.id),'[]'::jsonb),
    'daysUntilDue',b.days,'urgency',CASE WHEN b.days<0 THEN 'overdue' WHEN b.days=0 THEN 'today' WHEN b.days<=7 THEN 'soon' ELSE 'later' END,
    'href','/cards/'||c.id::text||'?statementId='||b.id::text
  ) ORDER BY b.due_at,b.id),'[]'::jsonb) AS agenda FROM balances b JOIN credit_cards c ON c.id=b.credit_card_id WHERE greatest(0,b.total-b.paid)>=0.005`);
  return cardAgendaSchema.parse(rows.rows[0]?.agenda);
}

/** Gross category shares weighted by current used credit. Frozen limit amounts are authoritative. */
export async function getCardCategoryUsage(db: Db, id: string, now: Date) {
  const rows = await db.execute(sql`WITH RECURSIVE category_tree AS (
    SELECT id AS root_id,id AS category_id,ARRAY[id] AS path FROM categories WHERE deleted_at IS NULL AND parent_id IS NULL
    UNION ALL SELECT t.root_id,c.id,t.path||c.id FROM categories c JOIN category_tree t ON c.parent_id=t.category_id WHERE c.deleted_at IS NULL AND NOT c.id=ANY(t.path)
  ), movements AS (
    SELECT id,kind,category_id,amount_in_limit_currency AS amount FROM credit_card_records WHERE credit_card_id=${id}::uuid AND deleted_at IS NULL AND occurred_at<=${now.toISOString()}::timestamptz
    UNION ALL SELECT r.id,CASE WHEN r.type='income' THEN 'refund' ELSE 'purchase' END,r.category_id,
      coalesce(r.amount_in_limit_currency,r.amount*coalesce(r.exchange_rate_to_limit_currency,1))
    FROM records r JOIN credit_cards c ON c.id=r.credit_card_id WHERE r.credit_card_id=${id}::uuid AND r.deleted_at IS NULL AND r.payment_status<>'cancelled' AND r.occurred_at<=${now.toISOString()}::timestamptz
      AND (r.currency=c.limit_currency OR (r.amount_in_limit_currency>0 AND r.amount_in_limit_currency<'Infinity'::numeric) OR (r.exchange_rate_to_limit_currency>0 AND r.exchange_rate_to_limit_currency<'Infinity'::numeric))
      AND NOT EXISTS(SELECT 1 FROM credit_card_records linked WHERE linked.credit_card_id=r.credit_card_id AND linked.wallet_record_id=r.id AND linked.deleted_at IS NULL)
  ), roots AS (
    SELECT c.id::text AS id,c.name,c.color,coalesce(sum(m.amount),0) AS gross FROM categories c JOIN category_tree t ON t.root_id=c.id
    LEFT JOIN movements m ON m.category_id=t.category_id AND m.kind='purchase' WHERE c.parent_id IS NULL AND c.deleted_at IS NULL GROUP BY c.id
  ), unclassified AS (
    SELECT coalesce(sum(m.amount),0) AS gross FROM movements m WHERE m.kind='purchase' AND NOT EXISTS(SELECT 1 FROM category_tree t WHERE t.category_id=m.category_id)
  ), all_totals AS (
    SELECT * FROM roots UNION ALL SELECT 'uncategorized','Uncategorized','#94A3B8',gross FROM unclassified
  ), used AS (
    SELECT greatest(0,coalesce((SELECT sum(CASE WHEN kind='refund' THEN -amount ELSE amount END) FROM movements),0)-coalesce((SELECT sum(amount_in_limit_currency) FROM credit_card_payments WHERE credit_card_id=${id}::uuid AND deleted_at IS NULL AND occurred_at<=${now.toISOString()}::timestamptz),0)) AS amount
  ), usage AS (
    SELECT t.id,t.name,t.color,t.gross*used.amount/nullif((SELECT sum(gross) FROM all_totals),0) AS amount FROM all_totals t CROSS JOIN used
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'amount',amount) ORDER BY amount DESC,id),'[]'::jsonb) AS usage FROM usage WHERE amount>0.000001`);
  return cardCategoryUsageSchema.parse(rows.rows[0]?.usage);
}

/** One repeatable, read-only batch for an explicitly opened card. No global wallet records. */
export async function getCardLedger(db: Db, id: string) {
  const activePayments = and(
    eq(creditCardPayments.creditCardId, id),
    isNull(creditCardPayments.deletedAt),
  );
  const rows = await namedBatch(db, {
    isolation: db.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`),
    records: db
      .select()
      .from(creditCardRecords)
      .where(and(eq(creditCardRecords.creditCardId, id), isNull(creditCardRecords.deletedAt)))
      .orderBy(desc(creditCardRecords.occurredAt), desc(creditCardRecords.id)),
    statements: db
      .select()
      .from(creditCardStatements)
      .where(eq(creditCardStatements.creditCardId, id))
      .orderBy(desc(creditCardStatements.cycleEnd)),
    payments: db
      .select()
      .from(creditCardPayments)
      .where(activePayments)
      .orderBy(desc(creditCardPayments.occurredAt), desc(creditCardPayments.id)),
    allocations: db
      .select()
      .from(creditCardPaymentAllocations)
      .where(
        inArray(
          creditCardPaymentAllocations.paymentId,
          db.select({ id: creditCardPayments.id }).from(creditCardPayments).where(activePayments),
        ),
      ),
  });
  return cardLedgerSchema.parse({
    creditCardRecords: rows.records.map(mapCreditCardRecord),
    creditCardStatements: rows.statements.map(mapCreditCardStatement),
    creditCardPayments: rows.payments.map(mapCreditCardPayment),
    creditCardPaymentAllocations: rows.allocations.map(mapCreditCardPaymentAllocation),
  });
}
