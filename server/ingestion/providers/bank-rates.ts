import { z } from "zod";

import type { BankExchangeRateProfile } from "../../../shared/schemas/card-mail-settings.js";
import type { CurrencyCode } from "../../../shared/types.js";
import type { Provider } from "./types.js";

export type BankRateProfile = Exclude<BankExchangeRateProfile, "reference">;
export type QuoteSide = "buy" | "sell";
interface BankRateInput {
  currency: CurrencyCode;
  occurredAt: Date;
  amount: number;
  side: QuoteSide;
}
interface BankQuote {
  buy: number;
  sell: number;
  date: Date;
}
const itauCodes: Partial<Record<CurrencyCode, string>> = {
  USD: "US.D",
  EUR: "EUR",
  BRL: "CRUZ",
  ARS: "ARGP",
};
const twoSidedQuote = z.object({ buy: z.number().positive(), sell: z.number().positive() });
const boardQuote = twoSidedQuote.extend({
  origin: z.string(),
  code: z.string(),
  type: z.string(),
  date: z.iso.datetime({ offset: true }),
});
const supernetRate = twoSidedQuote.extend({
  currency: z.string(),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive().nullable(),
});
const supernetSnapshot = z.object({ date: z.iso.date(), rates: z.array(supernetRate) });
const supernetFeed = z.object({
  bank: z.literal("santander"),
  current: supernetSnapshot.nullable(),
  history: z.array(supernetSnapshot).default([]),
});

function montevideoMidnight(day: string) {
  return new Date(`${day}T00:00:00-03:00`);
}

function itauQuote(xml: string, currency: CurrencyCode, link: boolean): BankQuote | undefined {
  const code = link ? (currency === "USD" ? "LINK" : undefined) : itauCodes[currency];
  if (!code) return undefined;
  const timestamp = /<fecha>\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*<\/fecha>/.exec(xml);
  if (!timestamp) return undefined;
  const [, year, month, day, hour, minute, second] = timestamp;
  const time = `${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`;
  if (!z.iso.datetime({ offset: true }).safeParse(time).success) return undefined;
  const entries = Array.from(
    xml.matchAll(/<cotizacion>([\s\S]*?)<\/cotizacion>/g),
    ([, body]) => body,
  );
  const matches = entries.filter(
    (entry) => /<moneda>([^<]+)<\/moneda>/.exec(entry ?? "")?.[1]?.trim() === code,
  );
  if (matches.length !== 1) return undefined;
  const buy = /<compra>\s*(\d+(?:[.,]\d+)?)\s*<\/compra>/.exec(matches[0] ?? "")?.[1];
  const sell = /<venta>\s*(\d+(?:[.,]\d+)?)\s*<\/venta>/.exec(matches[0] ?? "")?.[1];
  const parsed = twoSidedQuote.safeParse({
    buy: Number(buy?.replace(",", ".")),
    sell: Number(sell?.replace(",", ".")),
  });
  return parsed.success ? { ...parsed.data, date: new Date(time) } : undefined;
}

function board(
  data: unknown,
  bank: "brou" | "santander",
  currency: CurrencyCode,
  type: "" | "EBROU",
): BankQuote | undefined {
  const parsed = z.array(boardQuote).safeParse(Array.isArray(data) ? data : [data]);
  if (!parsed.success) return undefined;
  const matches = parsed.data.filter(
    (quote) => quote.origin === bank && quote.code === currency && quote.type === type,
  );
  const [quote] = matches;
  return matches.length === 1 && quote
    ? { buy: quote.buy, sell: quote.sell, date: new Date(quote.date) }
    : undefined;
}

function supernet(data: unknown, input: BankRateInput): BankQuote | undefined {
  const parsed = supernetFeed.safeParse(data);
  if (!parsed.success) return undefined;
  const { current, history } = parsed.data;
  const snapshots = current ? [current, ...history] : history;
  const snapshot = snapshots
    .filter((item) => montevideoMidnight(item.date) <= input.occurredAt)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!snapshot) return undefined;
  const matches = snapshot.rates.filter((level) => {
    const foreignAmount = input.side === "sell" ? input.amount : input.amount / level.buy;
    return (
      level.currency === input.currency &&
      foreignAmount >= level.minAmount &&
      (level.maxAmount === null || foreignAmount < level.maxAmount)
    );
  });
  const [level] = matches;
  return matches.length === 1 && level
    ? { buy: level.buy, sell: level.sell, date: montevideoMidnight(snapshot.date) }
    : undefined;
}

export function bankRateProvider(profile: BankRateProfile): Provider<BankRateInput, BankQuote> {
  return {
    name: `bank_fx:${profile}`,
    async call(input, { signal }) {
      const { currency } = input;
      if ((profile === "itau_link" || profile === "brou_ebrou") && currency !== "USD")
        return { status: "unavailable", reason: "unsupported_currency" };
      const itau = profile === "itau_link" || profile === "itau_board";
      const bank = profile === "brou_board" || profile === "brou_ebrou" ? "brou" : "santander";
      const url = itau
        ? "https://www.itau.com.uy/inst/aci/cotiz.xml"
        : profile === "santander_supernet"
          ? `https://api.cambio-uruguay.com/santander/preferential-rates?currency=${currency}`
          : `https://api.cambio-uruguay.com/exchange/${bank}/${currency}`;
      const response = await fetch(url, { signal });
      if (!response.ok) return { status: "failed", reason: `http_${response.status}` };
      const quote = itau
        ? itauQuote(await response.text(), currency, profile === "itau_link")
        : profile === "santander_supernet"
          ? supernet(await response.json(), input)
          : board(await response.json(), bank, currency, profile === "brou_ebrou" ? "EBROU" : "");
      if (!quote || quote.buy > quote.sell)
        return { status: "unavailable", reason: "missing_rate" };
      return { status: "ok", value: quote };
    },
  };
}
