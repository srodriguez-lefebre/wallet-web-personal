import type { CurrencyCode, ExchangeRate } from "./types.js";

/** Uses only quotes known at the requested instant; never invents a 1:1 quote. */
export function findExchangeRate(
  rates: ExchangeRate[], from: CurrencyCode, to: CurrencyCode, date: string | Date = new Date(),
): number | null {
  if (from === to) return 1;
  const cutoff = new Date(date).getTime();
  const latest = new Map<string, ExchangeRate>();
  for (const quote of rates) {
    if (!Number.isFinite(quote.rate) || quote.rate <= 0 || new Date(quote.date).getTime() > cutoff) continue;
    const key = `${quote.fromCurrency}:${quote.toCurrency}`;
    const previous = latest.get(key);
    if (!previous || new Date(quote.date).getTime() > new Date(previous.date).getTime()) latest.set(key, quote);
  }
  const direct = (a: CurrencyCode, b: CurrencyCode) => {
    const quote = latest.get(`${a}:${b}`);
    if (quote) return quote.rate;
    const inverse = latest.get(`${b}:${a}`);
    return inverse ? 1 / inverse.rate : null;
  };
  const rate = direct(from, to);
  if (rate !== null) return rate;
  for (const bridge of ["UYU", "USD", "EUR", "BRL", "ARS"] as CurrencyCode[]) {
    if (bridge === from || bridge === to) continue;
    const first = direct(from, bridge), second = direct(bridge, to);
    if (first !== null && second !== null) return first * second;
  }
  return null;
}
