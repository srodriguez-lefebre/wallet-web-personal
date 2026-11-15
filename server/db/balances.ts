import { sql, type SQL } from "drizzle-orm";

import { accountBalanceMetricsSchema } from "../../shared/read-model-contract.js";
import { exchangeRateSql } from "./fx.js";
import { asNumber } from "./mappers.js";

import type { AccountBalanceQuery } from "../../shared/read-model-contract.js";
import type { Db } from "./input-types.js";

type BalanceRow = {
  accountId: string;
  balance: string;
  totalBalance: string;
  reserved: string;
  freeBalance: string;
  balanceInPrimary: string | null;
  totalBalanceInPrimary: string | null;
};

/** One SQL read, shared by current balances and calendar-cutoff comparisons. */
export function accountBalanceMetricsSql(cutoff: SQL, now: Date, accountId?: string): SQL {
  const sourceAmount = sql`CASE WHEN r.account_amount IS NOT NULL THEN CASE WHEN r.account_amount>0 AND r.account_amount<'Infinity'::numeric THEN r.account_amount ELSE 0 END WHEN r.currency=a.currency THEN r.amount ELSE 0 END`;
  const destinationAmount = sql`CASE WHEN r.destination_amount IS NOT NULL THEN CASE WHEN r.destination_amount>0 AND r.destination_amount<'Infinity'::numeric THEN r.destination_amount ELSE 0 END WHEN r.currency=a.currency THEN r.amount ELSE 0 END`;
  return sql`WITH prefs AS (
    SELECT coalesce((SELECT primary_currency FROM settings LIMIT 1),'UYU') AS currency, ${cutoff}::timestamptz AS cutoff
  ), active_accounts AS (SELECT * FROM accounts WHERE deleted_at IS NULL AND ${accountId ? sql`id=${accountId}::uuid` : sql`true`}),
  financial_records AS (
    SELECT r.* FROM records r CROSS JOIN prefs WHERE r.deleted_at IS NULL AND r.payment_status<>'cancelled' AND (prefs.cutoff IS NULL OR r.occurred_at<prefs.cutoff)
  ), record_deltas AS (
    SELECT a.id,coalesce(sum(CASE
      WHEN r.type='income' AND r.account_id=a.id THEN ${sourceAmount}
      WHEN r.type='expense' AND r.account_id=a.id THEN -(${sourceAmount})
      WHEN r.type='transfer' AND r.account_id=a.id THEN -(${sourceAmount})
      WHEN r.type='transfer' AND r.destination_account_id=a.id THEN ${destinationAmount} ELSE 0 END),0) AS delta
    FROM active_accounts a LEFT JOIN financial_records r ON r.account_id=a.id OR r.destination_account_id=a.id GROUP BY a.id
  ), movements AS (
    SELECT c.* FROM credit_card_records c CROSS JOIN prefs WHERE c.deleted_at IS NULL AND (prefs.cutoff IS NULL OR c.occurred_at<prefs.cutoff)
  ), payments AS (
    SELECT p.* FROM credit_card_payments p CROSS JOIN prefs WHERE p.deleted_at IS NULL AND (prefs.cutoff IS NULL OR p.occurred_at<prefs.cutoff)
  ), allocations AS (
    SELECT a.* FROM credit_card_payment_allocations a JOIN payments p ON p.id=a.payment_id
  ), payment_pools AS (
    SELECT p.credit_card_id,p.statement_id,sum(coalesce((SELECT sum(a.amount_in_limit_currency) FROM allocations a WHERE a.payment_id=p.id),p.amount_in_limit_currency)) AS amount
    FROM payments p GROUP BY p.credit_card_id,p.statement_id
  ), net_purchases AS (
    SELECT p.*,greatest(0,p.amount_in_limit_currency-coalesce((SELECT sum(r.amount_in_limit_currency) FROM movements r WHERE r.kind='refund' AND r.original_record_id=p.id AND r.credit_card_id=p.credit_card_id),0)) AS net
    FROM movements p WHERE p.kind='purchase'
  ), ordered_purchases AS (
    SELECT p.*,coalesce(sum(net) OVER(PARTITION BY credit_card_id,statement_id ORDER BY occurred_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior
    FROM net_purchases p
  ), paid_purchases AS (
    SELECT p.*,least(p.net,greatest(0,coalesce(pool.amount,0)-p.prior)) AS paid,
      coalesce((SELECT sum(a.amount_in_limit_currency) FROM allocations a WHERE a.credit_card_record_id=p.id),0) AS historical_paid
    FROM ordered_purchases p LEFT JOIN payment_pools pool ON pool.credit_card_id=p.credit_card_id AND pool.statement_id IS NOT DISTINCT FROM p.statement_id
  ), released AS (
    SELECT account_id,sum(greatest(0,
      round(account_amount*least(amount_in_limit_currency,paid)/nullif(amount_in_limit_currency,0),2)
      -round(account_amount*least(amount_in_limit_currency,historical_paid)/nullif(amount_in_limit_currency,0),2))) AS amount
    FROM paid_purchases WHERE account_impact_at_creation AND account_amount IS NOT NULL AND amount_in_limit_currency>0 GROUP BY account_id
  ), reservation_groups AS (
    SELECT m.goal_id,m.account_id,m.currency,sum(CASE WHEN m.type IN('reserve','restore') THEN m.amount ELSE -m.amount END) AS amount
    FROM goal_reservation_movements m CROSS JOIN prefs WHERE prefs.cutoff IS NULL OR m.created_at<prefs.cutoff
    GROUP BY m.goal_id,m.account_id,m.currency
  ), balances AS (
    SELECT a.id,a.currency,a.initial_balance+d.delta
      +coalesce((SELECT sum(CASE WHEN m.kind='refund' THEN m.account_amount ELSE -m.account_amount END) FROM movements m WHERE m.account_id=a.id AND m.account_impact_at_creation AND m.wallet_record_id IS NULL AND m.account_amount IS NOT NULL),0)
      +coalesce((SELECT amount FROM released WHERE account_id=a.id),0)
      -coalesce((SELECT sum(account_amount) FROM payments WHERE account_id=a.id AND account_amount IS NOT NULL),0) AS total,
      coalesce((SELECT sum(g.amount) FROM reservation_groups g WHERE g.account_id=a.id AND (prefs.cutoff IS NOT NULL OR g.amount>0.005)),0) AS reserved
    FROM active_accounts a JOIN record_deltas d ON d.id=a.id CROSS JOIN prefs
  ) SELECT b.id::text AS "accountId",b.total-b.reserved AS balance,b.total AS "totalBalance",b.reserved,b.total-b.reserved AS "freeBalance",
    (b.total-b.reserved)*fx.rate AS "balanceInPrimary",b.total*fx.rate AS "totalBalanceInPrimary"
  FROM balances b CROSS JOIN prefs CROSS JOIN LATERAL (SELECT ${exchangeRateSql(sql`b.currency`, sql`prefs.currency`, now)} AS rate) fx`;
}

export async function getAccountBalanceMetrics(
  db: Db,
  query: AccountBalanceQuery = { timeZone: "America/Montevideo" },
  now = new Date(),
) {
  const cutoff = query.cutoff
    ? sql`((${query.cutoff}::date+1)::timestamp AT TIME ZONE ${query.timeZone})`
    : sql`NULL`;
  const result = await db.execute<BalanceRow>(accountBalanceMetricsSql(cutoff, now));
  return accountBalanceMetricsSchema.parse(
    result.rows.map((row) => ({
      accountId: row.accountId,
      balance: asNumber(row.balance),
      totalBalance: asNumber(row.totalBalance),
      reserved: asNumber(row.reserved),
      freeBalance: asNumber(row.freeBalance),
      balanceInPrimary: row.balanceInPrimary === null ? null : asNumber(row.balanceInPrimary),
      totalBalanceInPrimary:
        row.totalBalanceInPrimary === null ? null : asNumber(row.totalBalanceInPrimary),
    })),
  );
}
