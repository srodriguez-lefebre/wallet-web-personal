import { getExchangeRate } from "../db/fx.js";
import { exchangeRates } from "../db/schema.js";
import { runProvider } from "./providers/circuit.js";
import { frankfurterProvider } from "./providers/rates.js";

import type { CurrencyCode } from "../../shared/types.js";
import type { DbClient } from "../db/client.js";

export interface FrozenRate {
  rate: number;
  date: Date;
  source: "same_currency" | "frankfurter" | "stored_fallback";
  warning?: string;
}

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function resolveFrozenRate(
  db: DbClient,
  from: CurrencyCode,
  to: CurrencyCode,
  occurredAt: Date,
): Promise<FrozenRate | null> {
  if (from === to) return { rate: 1, date: utcDay(occurredAt), source: "same_currency" };

  const storedRate = await getExchangeRate(db, from, to, occurredAt);
  if (storedRate !== null && Number.isFinite(storedRate) && storedRate > 0)
    return { rate: storedRate, date: utcDay(occurredAt), source: "stored_fallback" };

  try {
    const result = await runProvider(
      db,
      frankfurterProvider,
      { from, to, date: occurredAt },
      { budgetMs: 4000 },
    );
    if (result.status !== "ok") return null;
    const fetched = result.value;
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
    return null;
  }
}
