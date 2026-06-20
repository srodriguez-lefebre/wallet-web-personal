import { describe, expect, it } from "vitest";
import { translateDatabaseError } from "./errors.js";

describe("database error translation", () => {
  it.each([
    ["23505", "CONFLICT", 409],
    ["23503", "REFERENCE_NOT_FOUND", 422],
    ["22P02", "VALIDATION_ERROR", 400],
  ])("maps %s without exposing driver messages", (code, publicCode, status) => {
    const result = translateDatabaseError({ cause: { code, message: "secret SQL" } });
    expect(result).toMatchObject({ code: publicCode, status });
    expect(result?.publicMessage).not.toContain("secret SQL");
  });

  it("maps delete foreign-key conflicts to 409", () => {
    expect(translateDatabaseError({ code: "23503" }, "delete")).toMatchObject({ status: 409 });
  });

  it("leaves unknown errors for the 500 boundary", () => {
    expect(translateDatabaseError({ code: "08000" })).toBeNull();
  });
});
