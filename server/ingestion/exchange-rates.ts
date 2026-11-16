import { getExchangeRate } from "../db/fx.js";
import { exchangeRates } from "../db/schema.js";
import { bankRateProvider, type BankRateProfile, type QuoteSide } from "./providers/bank-rates.js";
import { runProvider } from "./providers/circuit.js";
import { frankfurterProvider } from "./providers/rates.js";

import type { CurrencyCode } from "../../shared/types.js";
import type { BankExchangeRateProfile } from "../../shared/schemas/card-mail-settings.js";
import type { DbClient } from "../db/client.js";

export interface FrozenRate {
  rate: number;
  date: Date;
  source: "same_currency" | "frankfurter" | "stored_fallback" | BankRateProfile;
  side?: QuoteSide;
  warning?: string;
}

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function currentForTransaction(quotedAt: Date, occurredAt: Date) {
  const age = occurredAt.getTime() - quotedAt.getTime();
  return age >= 0 && age <= 4 * 86400000;
}

async function resolveSelectedRate(
  db: DbClient,
  from: CurrencyCode,
  to: CurrencyCode,
  occurredAt: Date,
  { profile, amount }: { profile: BankExchangeRateProfile; amount: number },
): Promise<FrozenRate | null> {
  if (profile === "reference") {
    const result = await runProvider(
      db,
      frankfurterProvider,
      { from, to, date: occurredAt },
      { budgetMs: 4000 },
    );
    return result.status === "ok" && currentForTransaction(result.value.date, occurredAt)
      ? { ...result.value, source: "frankfurter" }
      : null;
  }

  if (from !== "UYU" && to !== "UYU") return null;
  const side: QuoteSide = from === "UYU" ? "buy" : "sell";
  const currency = from === "UYU" ? to : from;
  const result = await runProvider(
    db,
    bankRateProvider(profile),
    { currency, occurredAt, amount, side },
    { budgetMs: 4000 },
  );
  if (result.status !== "ok" || !currentForTransaction(result.value.date, occurredAt)) return null;
  const quote = result.value;
  const rate = side === "buy" ? 1 / quote.buy : quote.sell;
  return Number.isFinite(rate) && rate > 0
    ? { rate, date: quote.date, source: profile, side }
    : null;
}

export async function resolveFrozenRate(
  db: DbClient,
  from: CurrencyCode,
  to: CurrencyCode,
  occurredAt: Date,
  selection?: { profile: BankExchangeRateProfile; amount: number },
): Promise<FrozenRate | null> {
  if (from === to) return { rate: 1, date: utcDay(occurredAt), source: "same_currency" };
  if (selection) return resolveSelectedRate(db, from, to, occurredAt, selection);

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
