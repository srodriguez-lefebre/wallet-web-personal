import { and, desc, eq, lte } from "drizzle-orm";
import type { CurrencyCode } from "../../shared/types.js";
import type { DbClient } from "../db/client.js";
import { exchangeRates } from "../db/schema.js";

export interface FrozenRate {
  rate: number;
  date: Date;
  source:
    | "same_currency"
    | "frankfurter"
    | "fixed_fallback"
    | "stored_fallback";
  warning?: string;
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

async function fetchFrankfurterRate(
  from: CurrencyCode,
  to: CurrencyCode,
  date: Date,
) {
  const day = utcDay(date).toISOString().slice(0, 10);
  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.searchParams.set("base", from);
  url.searchParams.set("quotes", to);
  url.searchParams.set("date", day);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Frankfurter returned ${response.status}`);
  const body = (await response.json()) as Array<{ date: string; rate: number }>;
  if (!body[0]?.rate || body[0].rate <= 0)
    throw new Error("Frankfurter returned no rate");
  return {
    rate: body[0].rate,
    date: new Date(`${body[0].date}T00:00:00.000Z`),
  };
}

export async function resolveFrozenRate(
  db: DbClient,
  from: CurrencyCode,
  to: CurrencyCode,
  occurredAt: Date,
): Promise<FrozenRate | null> {
  if (from === to)
    return { rate: 1, date: utcDay(occurredAt), source: "same_currency" };

  try {
    const fetched = await fetchFrankfurterRate(from, to, occurredAt);
    await db
      .insert(exchangeRates)
      .values({
        fromCurrency: from,
        toCurrency: to,
        rate: String(fetched.rate),
        date: fetched.date,
        source: "frankfurter",
      })
      .onConflictDoNothing();
    return { ...fetched, source: "frankfurter" };
  } catch {
    if (from === "USD" && to === "UYU") {
      return {
        rate: 40,
        date: utcDay(occurredAt),
        source: "fixed_fallback",
        warning:
          "Frankfurter unavailable; USD/UYU fixed fallback rate 40 was used.",
      };
    }

    const [stored] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrency, from),
          eq(exchangeRates.toCurrency, to),
          lte(exchangeRates.date, occurredAt),
        ),
      )
      .orderBy(desc(exchangeRates.date))
      .limit(1);
    if (!stored) return null;
    return {
      rate: Number(stored.rate),
      date: stored.date,
      source: "stored_fallback",
      warning: `Frankfurter unavailable; the last stored ${from}/${to} rate was used.`,
    };
  }
}
