import { sql, type SQL } from "drizzle-orm";

import { exchangeRates } from "./schema.js";

import type { CurrencyCode } from "../../shared/types.js";
import type { DbClient } from "./client.js";

/** Same direct/inverse/ordered-bridge policy as shared/money, with only latest quotes. */
export function exchangeRateSql(from: CurrencyCode, to: CurrencyCode, date: string | Date): SQL {
  if (from === to) return sql`1::numeric`;
  const cutoff = new Date(date).toISOString();
  const latest = (a: CurrencyCode, b: CurrencyCode) => sql`(
    SELECT ${exchangeRates.rate} FROM ${exchangeRates}
    WHERE ${exchangeRates.fromCurrency} = ${a} AND ${exchangeRates.toCurrency} = ${b}
      AND ${exchangeRates.date} <= ${cutoff}::timestamptz AND ${exchangeRates.rate} > 0
      AND ${exchangeRates.rate} <> 'NaN'::numeric
    ORDER BY ${exchangeRates.date} DESC LIMIT 1
  )`;
  const direct = (a: CurrencyCode, b: CurrencyCode) =>
    sql`COALESCE(${latest(a, b)}, 1::numeric / ${latest(b, a)})`;
  const alternatives = [direct(from, to)];
  for (const bridge of ["UYU", "USD", "EUR", "BRL", "ARS"] as const) {
    if (bridge !== from && bridge !== to)
      alternatives.push(sql`${direct(from, bridge)} * ${direct(bridge, to)}`);
  }
  return sql`COALESCE(${sql.join(alternatives, sql`, `)})`;
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
