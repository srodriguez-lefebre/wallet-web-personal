import { expect, test } from "vitest";

import { analyticsQuerySchema } from "./analytics-contract.js";
const range = { from: "2026-03-01", to: "2026-03-31" };
test("analytics accepts named IANA zones and rejects fixed numeric offsets", () => {
  for (const timeZone of ["UTC", "America/Montevideo", "Europe/Paris", "Etc/GMT+3"])
    expect(analyticsQuerySchema.safeParse({ ...range, timeZone }).success).toBe(true);
  for (const timeZone of ["+01:00", "-03:00", "+0100", "Invalid/Zone"])
    expect(analyticsQuerySchema.safeParse({ ...range, timeZone }).success).toBe(false);
});
