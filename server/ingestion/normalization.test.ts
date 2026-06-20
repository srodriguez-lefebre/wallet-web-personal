import { describe, expect, it } from "vitest";
import {
  cardLastFour,
  normalizeMerchantTerm,
  pickLongestMerchantMatch,
} from "./normalization.js";

describe("merchant normalization", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeMerchantTerm("  Géant—Pocitos  ")).toBe("GEANT POCITOS");
  });

  it("prefers the longest matching term and then priority", () => {
    const match = pickLongestMerchantMatch("Puma Energy 123", [
      { normalizedAlias: "PUMA", priority: 100 },
      { normalizedAlias: "PUMA ENERGY", priority: 0 },
    ]);
    expect(match?.normalizedAlias).toBe("PUMA ENERGY");
  });

  it("extracts the last four digits", () => {
    expect(cardLastFour("VISA **** 4006")).toBe("4006");
  });
});
