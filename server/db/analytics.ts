import { sql } from "drizzle-orm";

import {
  analyticsSummarySchema,
  type AnalyticsQuery,
  type AnalyticsResult,
} from "../../shared/analytics-contract.js";
import { exchangeRateSql } from "./fx.js";

import type { Db } from "./input-types.js";

/** Aggregates frozen record values; unresolved conversions remain explicit. No history leaves SQL. */
export async function getAnalyticsSummary(db: Db, input: AnalyticsQuery): Promise<AnalyticsResult> {
  const accountFilter = input.accountId
    ? sql`(r.account_id=${input.accountId}::uuid OR r.destination_account_id=${input.accountId}::uuid)`
    : sql`(prefs.include_hidden OR (r.account_id IS NULL AND r.destination_account_id IS NULL)
   OR EXISTS(SELECT 1 FROM accounts a WHERE a.id IN(r.account_id,r.destination_account_id) AND a.deleted_at IS NULL AND a.is_visible))`;
  const budgetFilter = input.accountId
    ? sql`(b.account_id IS NULL OR b.account_id=${input.accountId}::uuid)`
    : sql`(prefs.include_hidden OR b.account_id IS NULL OR EXISTS(SELECT 1 FROM accounts a WHERE a.id=b.account_id AND a.deleted_at IS NULL AND a.is_visible))`;
  const query = await db.execute(sql`WITH RECURSIVE category_tree AS (
   SELECT id AS root_id,id AS category_id,ARRAY[id] AS path FROM categories WHERE deleted_at IS NULL
   UNION ALL SELECT t.root_id,c.id,t.path||c.id FROM categories c JOIN category_tree t ON c.parent_id=t.category_id
     WHERE c.deleted_at IS NULL AND NOT c.id=ANY(t.path)
 ), prefs AS (
   SELECT coalesce((SELECT primary_currency FROM settings LIMIT 1),'UYU') AS currency,
     coalesce((SELECT include_hidden_accounts_in_reports FROM settings LIMIT 1),false) AS include_hidden
 ), filtered AS (
   SELECT r.* FROM records r CROSS JOIN prefs
   WHERE r.deleted_at IS NULL AND r.payment_status<>'cancelled' AND ${accountFilter}
     AND r.occurred_at>=(${input.from}::date::timestamp AT TIME ZONE ${input.timeZone})
     AND r.occurred_at<((${input.to}::date+1)::timestamp AT TIME ZONE ${input.timeZone})
 ), valid AS (
   SELECT *,amount*exchange_rate_to_primary AS primary_amount FROM filtered
   WHERE exchange_rate_to_primary>0 AND exchange_rate_to_primary<>'NaN'::numeric
 ), totals AS (
   SELECT coalesce(sum(primary_amount) FILTER(WHERE type='income'),0) AS income,
     coalesce(sum(primary_amount) FILTER(WHERE type='expense'),0) AS expenses FROM valid
 ), monthly AS (
   SELECT to_char(m.month,'YYYY-MM') AS month,
     coalesce(sum(r.primary_amount) FILTER(WHERE r.type='income'),0) AS income,
     coalesce(sum(r.primary_amount) FILTER(WHERE r.type='expense'),0) AS expenses
   FROM generate_series(date_trunc('month',${input.from}::date::timestamp),date_trunc('month',${input.to}::date::timestamp),interval '1 month') m(month)
   LEFT JOIN valid r ON to_char(r.occurred_at AT TIME ZONE ${input.timeZone},'YYYY-MM')=to_char(m.month,'YYYY-MM') GROUP BY m.month
 ), category_totals AS (
   SELECT c.id,c.name,c.color,c.icon,c.parent_id,
     coalesce(sum(r.primary_amount) FILTER(WHERE r.type='income'),0) AS income,
     coalesce(sum(r.primary_amount) FILTER(WHERE r.type='expense'),0) AS expenses
   FROM categories c JOIN category_tree t ON t.root_id=c.id LEFT JOIN valid r ON r.category_id=t.category_id
   WHERE c.deleted_at IS NULL GROUP BY c.id
 ), active_budgets AS (
   SELECT b.* FROM budgets b CROSS JOIN prefs WHERE b.is_active AND b.deleted_at IS NULL AND ${budgetFilter}
 ), budget_matches AS (
   SELECT b.id,r.id AS record_id,b.currency,
     CASE WHEN b.goal_id IS NOT NULL THEN coalesce((SELECT allocated_amount FROM record_goals WHERE record_id=r.id AND goal_id=b.goal_id),r.amount) ELSE r.amount END AS amount,
     r.currency AS record_currency,r.exchange_rate_to_primary,r.account_amount,r.amount AS full_amount,a.currency AS account_currency,r.occurred_at
   FROM active_budgets b LEFT JOIN filtered r ON r.type='expense'
     AND (b.category_id IS NULL OR EXISTS(SELECT 1 FROM category_tree t WHERE t.root_id=b.category_id AND t.category_id=r.category_id))
     AND (b.tag_id IS NULL OR EXISTS(SELECT 1 FROM record_tags t WHERE t.record_id=r.id AND t.tag_id=b.tag_id))
     AND (b.goal_id IS NULL OR EXISTS(SELECT 1 FROM record_goals g WHERE g.record_id=r.id AND g.goal_id=b.goal_id))
     AND (b.account_id IS NULL OR b.account_id=r.account_id)
   LEFT JOIN accounts a ON a.id=r.account_id
 ), budget_converted AS (
   SELECT b.*,CASE WHEN record_currency=b.currency THEN amount
     WHEN b.currency=prefs.currency THEN CASE WHEN exchange_rate_to_primary>0 AND exchange_rate_to_primary<>'NaN'::numeric THEN amount*exchange_rate_to_primary END
     WHEN account_currency=b.currency AND account_amount IS NOT NULL THEN account_amount*amount/nullif(full_amount,0)
     ELSE amount*${exchangeRateSql(sql`b.record_currency`, sql`b.currency`, sql`b.occurred_at`)} END AS converted FROM budget_matches b CROSS JOIN prefs
 ), budget_totals AS (
   SELECT id,coalesce(sum(converted),0) AS spent,count(*) FILTER(WHERE record_id IS NOT NULL AND converted IS NULL)::int AS unresolved
   FROM budget_converted GROUP BY id
 ), budget_result AS (
   SELECT b.id,jsonb_strip_nulls(jsonb_build_object('id',b.id,'name',b.name,'limitAmount',b.limit_amount,'currency',b.currency,'period',b.period,
     'categoryId',b.category_id,'tagId',b.tag_id,'accountId',b.account_id,'goalId',b.goal_id,'color',b.color,'isActive',b.is_active)) AS budget,
     CASE WHEN t.unresolved=0 THEN t.spent END AS spent,CASE WHEN t.unresolved=0 THEN b.limit_amount-t.spent END AS remaining,
     CASE WHEN t.unresolved=0 THEN least(999,t.spent/b.limit_amount*100) END AS percentage,
     CASE WHEN t.unresolved>0 THEN 'warning' WHEN t.spent>=b.limit_amount THEN 'exceeded' WHEN t.spent>=b.limit_amount*0.8 THEN 'warning' ELSE 'ok' END AS status,
     t.unresolved FROM active_budgets b JOIN budget_totals t ON t.id=b.id
 ) SELECT jsonb_build_object(
   'from',${input.from}::text,'to',${input.to}::text,'timeZone',${input.timeZone}::text,'primaryCurrency',prefs.currency,
   'income',totals.income,'expenses',totals.expenses,'cashFlow',totals.income-totals.expenses,
   'unresolvedRecords',(SELECT count(*) FROM filtered WHERE type IN('income','expense') AND (exchange_rate_to_primary<=0 OR exchange_rate_to_primary='NaN'::numeric)),
   'monthlySeries',coalesce((SELECT jsonb_agg(jsonb_build_object('month',month,'income',income,'expenses',expenses,'cashFlow',income-expenses) ORDER BY month) FROM monthly),'[]'::jsonb),
   'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'icon',icon,'parentId',parent_id,'income',income,'expenses',expenses) ORDER BY name,id) FROM category_totals),'[]'::jsonb),
   'budgets',coalesce((SELECT jsonb_agg(jsonb_build_object('budget',budget,'spent',spent,'remaining',remaining,'percentage',percentage,'status',status,'unresolvedRecords',unresolved) ORDER BY id) FROM budget_result),'[]'::jsonb)
 ) AS summary FROM prefs CROSS JOIN totals`);
  return analyticsSummarySchema.parse(query.rows[0]?.summary);
}
