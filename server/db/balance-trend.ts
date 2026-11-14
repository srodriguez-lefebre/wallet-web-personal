import { sql } from "drizzle-orm";

import { balanceTrendSchema, type BalanceTrendQuery } from "../../shared/report-contract.js";
import { accountBalanceMetricsSql } from "./balances.js";
import { reportPeriodsSql } from "./report-periods.js";

import type { Db } from "./input-types.js";

/** Reuses the balance arithmetic in one HTTP read; points use exclusive next-day local cutoffs. */
export async function getBalanceTrend(db: Db, input: BalanceTrendQuery, now: Date) {
  const result = await db.execute(sql`WITH periods AS (${reportPeriodsSql(input)}), days AS (
    SELECT p.i,d.day::date AS day,(d.day::date-p.from_date+1) AS n FROM periods p CROSS JOIN LATERAL generate_series(p.from_date::timestamp,p.to_date::timestamp,interval '1 day') d(day)
  ), points AS (
    SELECT d.i,d.n,coalesce(b.balance,0) AS value FROM days d LEFT JOIN LATERAL (
      ${accountBalanceMetricsSql(sql`((d.day+1)::timestamp AT TIME ZONE ${input.timeZone})`, now, input.accountId)}
    ) b ON true
  ), chart AS (
    SELECT n,jsonb_build_object('day','Day '||n,'previousPrevious',max(value) FILTER(WHERE i=0),'previous',max(value) FILTER(WHERE i=1),'current',max(value) FILTER(WHERE i=2)) AS point FROM points GROUP BY n
  ) SELECT coalesce(jsonb_agg(point ORDER BY n),'[]'::jsonb) AS chart FROM chart`);
  return balanceTrendSchema.parse(result.rows[0]?.chart);
}
