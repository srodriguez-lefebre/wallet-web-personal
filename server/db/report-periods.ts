import { sql } from "drizzle-orm";

import type { ReportQuery } from "../../shared/report-contract.js";

/** Calendar dates, independent of the server's locale and DST. Oldest period first. */
export function reportPeriodsSql(
  input: Pick<ReportQuery, "from" | "to" | "selectedMonth" | "periodMode">,
) {
  return sql`SELECT i,
    CASE WHEN ${input.periodMode}='custom' THEN from_date-(2-i)*(to_date-from_date+1) ELSE (month+(i-2)*interval '1 month')::date END AS from_date,
    CASE WHEN ${input.periodMode}='custom' THEN to_date-(2-i)*(to_date-from_date+1) ELSE (month+(i-1)*interval '1 month'-interval '1 day')::date END AS to_date
    FROM (SELECT ${input.from}::date AS from_date,${input.to}::date AS to_date,(${input.selectedMonth}||'-01')::date AS month) dates CROSS JOIN generate_series(0,2) p(i)`;
}
