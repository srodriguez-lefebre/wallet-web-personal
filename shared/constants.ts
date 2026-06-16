import type { CurrencyCode } from "./types.js";

export const currencyLabels: Record<CurrencyCode, string> = {
  UYU: "Peso uruguayo",
  USD: "Dolar estadounidense",
  EUR: "Euro",
  BRL: "Real brasileno",
  ARS: "Peso argentino",
};

export const primaryCurrency: CurrencyCode = "UYU";

export const todayIso = "2026-06-15T12:00:00.000Z";
