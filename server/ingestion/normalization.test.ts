import { describe, expect, it } from "vitest";
import {
  cardLastFour,
  merchantTokenSequenceMatch,
  normalizeMerchantTerm,
  pickLongestMerchantMatch,
} from "./normalization.js";

describe("merchant normalization", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeMerchantTerm("  G\u00e9ant\u2014Pocitos  ")).toBe("GEANT POCITOS");
  });

  it("prefers the longest matching term and then priority", () => {
    const match = pickLongestMerchantMatch("Puma Energy 123", [
      { normalizedAlias: "PUMA", priority: 100 },
      { normalizedAlias: "PUMA ENERGY", priority: 0 },
    ]);
    expect(match?.normalizedAlias).toBe("PUMA ENERGY");
  });

  it("matches aliases as full token sequences instead of inner substrings", () => {
    expect(merchantTokenSequenceMatch("FRUTERIA OLIMAR MONTE", "UTE")).toBe(false);
    expect(merchantTokenSequenceMatch("PAGO UTE MONTEVIDEO", "UTE")).toBe(true);
    expect(merchantTokenSequenceMatch("MERPAGO*VIKEI 59829", "MERPAGO")).toBe(true);
    expect(merchantTokenSequenceMatch("COMPRA MERCADO PAGO", "MERCADO PAGO")).toBe(true);
  });

  it("extracts the last four digits", () => {
    expect(cardLastFour("VISA **** 4006")).toBe("4006");
  });
});
