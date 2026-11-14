import { sql, type SQL } from "drizzle-orm";

import { exchangeRates } from "./schema.js";

import type { CurrencyCode } from "../../shared/types.js";
import type { DbClient } from "./client.js";

type CurrencyTerm = CurrencyCode | SQL;

/** Same direct/inverse/ordered-bridge policy as shared/money, with latest quotes only.
 * SQL terms let read aggregates use each row's frozen currency and timestamp. */
export function exchangeRateSql(
  from: CurrencyTerm,
  to: CurrencyTerm,
  date: string | Date | SQL,
): SQL {
  if (typeof from === "string" && from === to) return sql`1::numeric`;
  const cutoff =
    typeof date === "string" || date instanceof Date
      ? sql`${new Date(date).toISOString()}::timestamptz`
      : sql`${date}::timestamptz`;
  const latest = (a: CurrencyTerm, b: CurrencyTerm) => sql`(
    SELECT ${exchangeRates.rate} FROM ${exchangeRates}
    WHERE ${exchangeRates.fromCurrency} = ${a} AND ${exchangeRates.toCurrency} = ${b}
      AND ${exchangeRates.date} <= ${cutoff} AND ${exchangeRates.rate} > 0
      AND ${exchangeRates.rate} <> 'NaN'::numeric
    ORDER BY ${exchangeRates.date} DESC LIMIT 1
  )`;
  const direct = (a: CurrencyTerm, b: CurrencyTerm) =>
    sql`COALESCE(${latest(a, b)}, 1::numeric / ${latest(b, a)})`;
  const alternatives = [direct(from, to)];
  for (const bridge of ["UYU", "USD", "EUR", "BRL", "ARS"] as const) {
    if (bridge !== from && bridge !== to)
      alternatives.push(
        sql`CASE WHEN ${from} <> ${bridge} AND ${to} <> ${bridge} THEN ${direct(from, bridge)} * ${direct(bridge, to)} END`,
      );
  }
  return sql`CASE WHEN ${from} = ${to} THEN 1::numeric ELSE COALESCE(${sql.join(alternatives, sql`, `)}) END`;
}

export async function getExchangeRate(
  db: DbClient,
  from: CurrencyCode,
  to: CurrencyCode,
  date: string | Date,
) {
  if (from === to) return 1;
  const result = await db.execute(sql`SELECT ${exchangeRateSql(from, to, date)} AS rate`);
  const value = result.rows[0]?.rate;
  return value === null || value === undefined ? null : Number(value);
}
