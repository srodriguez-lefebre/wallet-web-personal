import { expect, test } from "vitest";

import {
  cardLastFour,
  normalizeMerchantTerm,
  parseAmount,
  parseBankCurrency,
} from "./mail-normalization";

test("the shared normalizer preserves existing merchant tokens, masked references and bank currencies", () => {
  expect(normalizeMerchantTerm("  Café*Test   Monte ")).toBe("CAFE TEST MONTE");
  expect(cardLastFour("****2468")).toBe("2468");
  expect(cardLastFour("123")).toBeUndefined();
  expect(parseBankCurrency("URGP")).toBe("UYU");
  expect(parseBankCurrency("Dólares")).toBe("USD");
  expect(() => parseBankCurrency("XXX")).toThrow();
});
test.each(["1,23,45", "12.3456", "1.234,567", "NaN"])("ambiguous amount %s is rejected", (raw) => {
  expect(() => parseAmount(raw)).toThrow();
});
