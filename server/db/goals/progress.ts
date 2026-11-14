import { sql } from "drizzle-orm";

import { goalProgressMetricsSchema } from "../../../shared/read-model-contract.js";
import { exchangeRateSql } from "../fx.js";
import { asNumber } from "../mappers.js";

import type { Db } from "../input-types.js";

type ProgressRow = { goalId: string; hasMissingExchangeRate: boolean } & Record<
  "reserved" | "spent" | "committed" | "remaining" | "overTarget" | "percentage",
  string | null
>;

/** Allocated portions and frozen record conversions stay numeric until the response. */
export async function getGoalProgressMetrics(db: Db, now = new Date()) {
  const result =
    await db.execute<ProgressRow>(sql`WITH prefs AS (SELECT coalesce((SELECT primary_currency FROM settings LIMIT 1),'UYU') AS currency),
  reservation_groups AS (
    SELECT goal_id,account_id,currency,sum(CASE WHEN type IN('reserve','restore') THEN amount ELSE -amount END) AS amount
    FROM goal_reservation_movements GROUP BY goal_id,account_id,currency HAVING sum(CASE WHEN type IN('reserve','restore') THEN amount ELSE -amount END)>0.005
  ), converted_reservations AS (
    SELECT g.id AS goal_id,r.amount, r.amount*${exchangeRateSql(sql`r.currency`, sql`g.currency`, now)} AS converted
    FROM goals g JOIN reservation_groups r ON r.goal_id=g.id WHERE g.deleted_at IS NULL
  ), allocated_records AS (
    SELECT g.id AS goal_id,g.currency AS goal_currency,prefs.currency AS primary_currency,r.*,a.currency AS account_currency,coalesce(link.allocated_amount,r.amount) AS allocated
    FROM goals g JOIN record_goals link ON link.goal_id=g.id JOIN records r ON r.id=link.record_id
    LEFT JOIN accounts a ON a.id=r.account_id AND a.deleted_at IS NULL CROSS JOIN prefs
    WHERE g.deleted_at IS NULL AND r.deleted_at IS NULL AND r.payment_status<>'cancelled' AND r.type IN('expense','income')
  ), converted_records AS (
    SELECT r.*,CASE WHEN allocated=0 OR currency=goal_currency THEN allocated
      WHEN account_currency=goal_currency AND account_amount>0 AND account_amount<'Infinity'::numeric THEN account_amount*allocated/nullif(amount,0)
      WHEN goal_currency=primary_currency THEN CASE WHEN exchange_rate_to_primary>0 AND exchange_rate_to_primary<'Infinity'::numeric THEN allocated*exchange_rate_to_primary END
      ELSE allocated*${exchangeRateSql(sql`r.currency`, sql`r.goal_currency`, sql`r.occurred_at`)} END AS converted
    FROM allocated_records r
  ), reserved AS (
    SELECT goal_id,sum(converted) AS amount,count(*) FILTER(WHERE converted IS NULL) AS unresolved FROM converted_reservations GROUP BY goal_id
  ), spent AS (
    SELECT goal_id,sum(CASE WHEN type='expense' THEN converted ELSE -converted END) AS amount,count(*) FILTER(WHERE converted IS NULL) AS unresolved FROM converted_records GROUP BY goal_id
  ), metrics AS (
    SELECT g.id,g.target_amount,coalesce(r.unresolved,0)+coalesce(s.unresolved,0)>0 AS missing,
      CASE WHEN coalesce(r.unresolved,0)=0 THEN coalesce(r.amount,0) END AS reserved,
      CASE WHEN coalesce(s.unresolved,0)=0 THEN greatest(0,coalesce(s.amount,0)) END AS spent
    FROM goals g LEFT JOIN reserved r ON r.goal_id=g.id LEFT JOIN spent s ON s.goal_id=g.id WHERE g.deleted_at IS NULL
  ) SELECT id::text AS "goalId",missing AS "hasMissingExchangeRate",reserved,spent,reserved+spent AS committed,
    CASE WHEN reserved+spent IS NOT NULL THEN greatest(0,target_amount-reserved-spent) END AS remaining,
    CASE WHEN reserved+spent IS NOT NULL THEN greatest(0,reserved+spent-target_amount) END AS "overTarget",
    (reserved+spent)/nullif(target_amount,0)*100 AS percentage FROM metrics`);
  const value = (input: string | null) => (input === null ? null : asNumber(input));
  return goalProgressMetricsSchema.parse(
    result.rows.map((row) => ({
      goalId: row.goalId,
      hasMissingExchangeRate: row.hasMissingExchangeRate,
      reserved: value(row.reserved),
      spent: value(row.spent),
      committed: value(row.committed),
      remaining: value(row.remaining),
      overTarget: value(row.overTarget),
      percentage: value(row.percentage),
    })),
  );
}
