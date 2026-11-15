import { differenceInCalendarDays, endOfMonth } from "date-fns";

import { calculateSummary } from "./analytics.js";
import { calculateVisibleBalance } from "./balances.js";
import { formatMoney } from "./money.js";
import { monthKey } from "./dates.js";

import type { WalletDataset } from "./types.js";

export function calculateEndOfMonthProjection(
  dataset: WalletDataset,
  dailySpend: number,
  now: Date,
) {
  const remainingDays = Math.max(1, differenceInCalendarDays(endOfMonth(now), now) + 1);
  const balance = calculateVisibleBalance(dataset, now);

  return balance - dailySpend * remainingDays;
}

export function calculateAllowedDailySpend(dataset: WalletDataset, now: Date) {
  const remainingDays = Math.max(1, differenceInCalendarDays(endOfMonth(now), now) + 1);
  const balance = calculateVisibleBalance(dataset, now);

  return balance / remainingDays;
}

export function buildSavingsRecommendations(dataset: WalletDataset, now: Date) {
  const summary = calculateSummary(dataset, monthKey(now), now);
  const allowedDaily = calculateAllowedDailySpend(dataset, now);
  const recommendations = [
    `Average daily spending: ${formatMoney(
      summary.dailyAverageExpense,
      dataset.settings.primaryCurrency,
    )}.`,
    `Estimated daily allowance: ${formatMoney(allowedDaily, dataset.settings.primaryCurrency)}.`,
  ];

  if (summary.dailyAverageExpense > allowedDaily) {
    recommendations.push("Average daily spending is above the estimated daily allowance.");
  }

  if (summary.cashFlow < 0) {
    recommendations.push("This month's cash flow is negative; review variable expenses.");
  }

  return recommendations;
}
