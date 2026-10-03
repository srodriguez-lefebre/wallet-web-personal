import { afterEach, expect, test, vi } from "vitest";
import { calculateSummary } from "./calculations";
import { mockWalletData } from "./mock-data";
afterEach(() => vi.useRealTimers());
test("past month daily average uses that month duration, not today's day", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  const summary = calculateSummary(mockWalletData, "2026-06");
  expect(summary.dailyAverageExpense).toBeCloseTo(summary.expenses / 30);
});
