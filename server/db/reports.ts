import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  reportDetailsSchema,
  type ReportDetails,
  type ReportQuery,
} from "../../shared/report-contract.js";
import { reportPeriodsSql } from "./report-periods.js";

import type { Db } from "./input-types.js";

const merchantGroupsSchema = z.array(
  z.object({
    name: z.string().nullable(),
    purchases: z.number(),
    total: z.number(),
    latest: z.string(),
    id: z.string(),
  }),
);

/** Chart points and grouped purchases only. No wallet history is returned or mutated. */
export async function getReportDetails(
  db: Db,
  input: ReportQuery,
  now: Date,
): Promise<ReportDetails> {
  const accountScope = input.accountId
    ? sql`(r.account_id=${input.accountId}::uuid OR r.destination_account_id=${input.accountId}::uuid)`
    : sql`(prefs.include_hidden OR (r.account_id IS NULL AND r.destination_account_id IS NULL) OR EXISTS(SELECT 1 FROM accounts a WHERE a.id IN(r.account_id,r.destination_account_id) AND a.deleted_at IS NULL AND a.is_visible))`;
  const scope = input.creditCardId
    ? sql`r.credit_card_id=${input.creditCardId}::uuid AND ${input.accountId ? accountScope : sql`true`}`
    : accountScope;
  const result = await db.execute(sql`WITH prefs AS (
    SELECT coalesce((SELECT include_hidden_accounts_in_reports FROM settings LIMIT 1),false) AS include_hidden,
      ${input.from}::date AS from_date,${input.to}::date AS to_date,(${input.selectedMonth}||'-01')::date AS month,
      (${now.toISOString()}::timestamptz AT TIME ZONE ${input.timeZone})::date AS today,
      CASE WHEN ${input.periodMode}='month' THEN (${input.selectedMonth}||'-01')::date ELSE date_trunc('month',${input.to}::date)::date END AS runway_month
  ), scoped AS (
    SELECT r.*, (r.occurred_at AT TIME ZONE ${input.timeZone})::date AS local_date FROM records r CROSS JOIN prefs WHERE r.deleted_at IS NULL AND ${scope}
  ), valid AS (
    SELECT *,amount*exchange_rate_to_primary AS primary_amount FROM scoped WHERE payment_status<>'cancelled' AND exchange_rate_to_primary>0 AND exchange_rate_to_primary<>'NaN'::numeric
  ), periods AS (${reportPeriodsSql(input)}  ), days AS (
    SELECT p.i,d.day::date AS day,(d.day::date-p.from_date+1) AS n FROM periods p CROSS JOIN LATERAL generate_series(p.from_date::timestamp,p.to_date::timestamp,interval '1 day') d(day)
  ), day_values AS (
    SELECT d.i,d.n,coalesce(sum(r.primary_amount),0) AS expense FROM days d LEFT JOIN valid r ON r.local_date=d.day AND r.type='expense' GROUP BY d.i,d.n
  ), day_cumulative AS (
    SELECT i,n,sum(expense) OVER(PARTITION BY i ORDER BY n ROWS UNBOUNDED PRECEDING) AS value FROM day_values
  ), day_chart AS (
    SELECT n,jsonb_build_object('day','Day '||n,'previousPrevious',max(value) FILTER(WHERE i=0),'previous',max(value) FILTER(WHERE i=1),'current',max(value) FILTER(WHERE i=2)) AS point FROM day_cumulative GROUP BY n
  ), sequence AS (
    SELECT p.i,row_number() OVER(PARTITION BY p.i ORDER BY r.occurred_at,r.id) AS n,
      sum(r.primary_amount) OVER(PARTITION BY p.i ORDER BY r.occurred_at,r.id ROWS UNBOUNDED PRECEDING) AS value
    FROM periods p JOIN valid r ON r.local_date BETWEEN p.from_date AND p.to_date AND r.type='expense'
  ), sequence_chart AS (
    SELECT n,jsonb_build_object('expense','Expense '||n,'previousPrevious',max(value) FILTER(WHERE i=0),'previous',max(value) FILTER(WHERE i=1),'current',max(value) FILTER(WHERE i=2)) AS point FROM sequence GROUP BY n
  ), available_months AS (
    SELECT DISTINCT date_trunc('month',local_date)::date AS month FROM scoped
  ), recent_months AS (
    SELECT month FROM (SELECT month FROM available_months UNION ALL SELECT CASE WHEN ${input.periodMode}='month' THEN month ELSE date_trunc('month',to_date)::date END FROM prefs WHERE NOT EXISTS(SELECT 1 FROM available_months)) m ORDER BY month DESC LIMIT 6
  ), monthly_totals AS (
    SELECT m.month,coalesce(sum(r.primary_amount) FILTER(WHERE r.type='income'),0) AS income,coalesce(sum(r.primary_amount) FILTER(WHERE r.type='expense'),0) AS expenses
    FROM recent_months m LEFT JOIN valid r ON date_trunc('month',r.local_date)::date=m.month GROUP BY m.month
  ), comparison_totals AS (
    SELECT coalesce(sum(r.primary_amount) FILTER(WHERE r.type='income'),0) AS income,coalesce(sum(r.primary_amount) FILTER(WHERE r.type='expense'),0) AS expenses
    FROM periods p LEFT JOIN valid r ON r.local_date BETWEEN p.from_date AND p.to_date WHERE p.i=1
  ), current_totals AS (
    SELECT coalesce(sum(r.primary_amount) FILTER(WHERE r.type='income'),0) AS income,coalesce(sum(r.primary_amount) FILTER(WHERE r.type='expense'),0) AS expenses
    FROM prefs LEFT JOIN valid r ON date_trunc('month',r.local_date)=date_trunc('month',prefs.today)
  ), runway_months AS (
    SELECT (runway_month-i*interval '1 month')::date AS month FROM prefs CROSS JOIN generate_series(1,3) m(i)
  ), runway AS (
    SELECT coalesce(sum(r.primary_amount),0)/3 AS average FROM runway_months m LEFT JOIN valid r ON date_trunc('month',r.local_date)::date=m.month AND r.type='expense'
  ), merchant_groups AS (
    SELECT r.counterparty_name AS name,count(*)::int AS purchases,sum(r.primary_amount) AS total,
      (array_agg(r.occurred_at ORDER BY r.occurred_at DESC,r.id DESC))[1] AS latest,
      (array_agg(r.id ORDER BY r.occurred_at DESC,r.id DESC))[1] AS id
    FROM valid r CROSS JOIN prefs WHERE r.type='expense' AND r.local_date BETWEEN prefs.from_date AND prefs.to_date GROUP BY r.counterparty_name
  ) SELECT jsonb_build_object(
    'monthlySeries',coalesce((SELECT jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),'income',income,'expenses',expenses,'cashFlow',income-expenses) ORDER BY month) FROM monthly_totals),'[]'::jsonb),
    'expenseTrend',coalesce((SELECT jsonb_agg(point ORDER BY n) FROM day_chart),'[]'::jsonb),
    'expenseSequenceTrend',coalesce((SELECT jsonb_agg(point ORDER BY n) FROM sequence_chart),'[]'::jsonb),
    'previousTotals',(SELECT jsonb_build_object('income',income,'expenses',expenses,'cashFlow',income-expenses) FROM comparison_totals),
    'currentMonthTotals',(SELECT jsonb_build_object('income',income,'expenses',expenses,'cashFlow',income-expenses) FROM current_totals),
    'averageMonthlyExpenses',(SELECT average FROM runway),
    'expenseMonths',(SELECT jsonb_agg(to_char(month,'YYYY-MM') ORDER BY month) FROM runway_months),
    'merchants',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'purchases',purchases,'total',total,'latest',latest,'id',id) ORDER BY latest DESC,id DESC) FROM merchant_groups),'[]'::jsonb)
  ) AS details`);
  // Group raw names in SQL first; JS preserves the existing Unicode trim/case rules.
  const raw = z
    .object({ merchants: merchantGroupsSchema })
    .passthrough()
    .parse(result.rows[0]?.details);
  const merchants = new Map<string, ReportDetails["merchants"][number]>();
  for (const group of raw.merchants) {
    const name = group.name?.trim() || "Unspecified merchant";
    const key = group.name?.trim().toLocaleLowerCase() || "";
    const item = merchants.get(key) ?? { key, name, purchases: 0, total: 0, average: 0 };
    item.purchases += group.purchases;
    item.total += group.total;
    merchants.set(key, item);
  }
  return reportDetailsSchema.parse({
    ...raw,
    merchants: [...merchants.values()]
      .map((item) => ({ ...item, average: item.total / item.purchases }))
      .sort(
        (a, b) => b.total - a.total || b.purchases - a.purchases || a.name.localeCompare(b.name),
      ),
  });
}
