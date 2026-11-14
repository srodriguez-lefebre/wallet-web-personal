import { expect, test } from "vitest";

import { isPgError, pgErrorDetails } from "./pg-error.js";

test("PostgreSQL errors retain only code and constraint through wrapped causes", () => {
  let error: unknown = {
    code: "23505",
    constraint: "synthetic_unique",
    query: "private",
    params: ["private"],
  };
  for (let i = 0; i < 8; i++) error = new Error("Wrapped", { cause: error });
  expect(isPgError(error, "23505")).toBe(true);
  expect(pgErrorDetails(error)).toEqual({ code: "23505", constraint: "synthetic_unique" });
});
test("malformed and circular causes do not loop or get treated as PostgreSQL errors", () => {
  const circular: { cause?: unknown; code: string } = { code: "NOT_PG" };
  circular.cause = circular;
  expect(isPgError(circular, "23505")).toBe(false);
  expect(pgErrorDetails(null)).toEqual({});
});
