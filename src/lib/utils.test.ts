import { describe, expect, it } from "vitest";
import { limitDecimalPlaces } from "./utils";

describe("number input helpers", () => {
  it("limits decimal input to two places by default", () => {
    expect(limitDecimalPlaces("123.4567")).toBe("123.45");
    expect(limitDecimalPlaces("123,4567")).toBe("123.45");
  });

  it("keeps whole numbers and editable decimal endings", () => {
    expect(limitDecimalPlaces("123")).toBe("123");
    expect(limitDecimalPlaces("123.")).toBe("123.");
  });
});
