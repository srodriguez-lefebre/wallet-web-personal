import { expect, test } from "vitest";
import { findExchangeRate } from "./money.js";
import type { ExchangeRate } from "./types.js";
const rates: ExchangeRate[] = [
  { id: "a", fromCurrency: "USD", toCurrency: "UYU", rate: 40, date: "2026-01-01" },
  { id: "b", fromCurrency: "USD", toCurrency: "UYU", rate: 42, date: "2026-02-01" },
  { id: "c", fromCurrency: "EUR", toCurrency: "USD", rate: 1.2, date: "2026-01-01" },
];
test("selects the last historical quote and supports inverse and bridge currencies", () => {
  expect(findExchangeRate(rates, "USD", "UYU", "2026-01-15")).toBe(40);
  expect(findExchangeRate(rates, "UYU", "USD", "2026-02-15")).toBe(1 / 42);
  expect(findExchangeRate(rates, "EUR", "UYU", "2026-01-15")).toBe(48);
});
test("missing or future quotes cannot silently become one-to-one", () => {
  expect(findExchangeRate(rates, "USD", "UYU", "2025-01-01")).toBeNull();
  expect(findExchangeRate(rates, "BRL", "UYU")).toBeNull();
  expect(findExchangeRate(rates, "UYU", "UYU")).toBe(1);
});
