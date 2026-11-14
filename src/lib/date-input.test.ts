import { expect, test } from "vitest";

import {
  localDateInput,
  dateInputToIso,
  localDateTimeInput,
  dateTimeInputToIso,
} from "./date-input";
test("uses the selected local calendar day and a stable instant for payment retries", () => {
  const date = new Date(2026, 1, 1, 23, 30);
  expect(localDateInput(date)).toBe("2026-02-01");
  const parsed = new Date(dateInputToIso("2026-02-01"));
  expect(parsed.getDate()).toBe(1);
  expect(parsed.getHours()).toBe(12);
  expect(dateInputToIso("2026-02-01")).toBe(dateInputToIso("2026-02-01"));
});
test("preserves plain dates and rejects impossible dates", () => {
  expect(localDateInput("2026-02-01")).toBe("2026-02-01");
  expect(() => dateInputToIso("2026-02-30")).toThrow();
});
test("datetime controls preserve the local clock and reject impossible calendar values", () => {
  const value = new Date(2026, 1, 1, 23, 30, 12);
  expect(localDateTimeInput(value)).toBe("2026-02-01T23:30");
  const roundtrip = new Date(dateTimeInputToIso("2026-02-01T23:30"));
  expect(roundtrip.getDate()).toBe(1);
  expect(roundtrip.getHours()).toBe(23);
  expect(roundtrip.getMinutes()).toBe(30);
  expect(() => dateTimeInputToIso("2026-02-30T12:00")).toThrow();
  expect(() => dateTimeInputToIso("2026-02-01T25:00")).toThrow();
});
