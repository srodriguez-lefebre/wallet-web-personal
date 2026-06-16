import { differenceInCalendarDays, endOfMonth } from "date-fns";
import type { WalletDataset } from "./types.js";
import {
  calculateSummary,
  calculateVisibleBalance,
  formatMoney,
  monthKey,
} from "./calculations.js";

export function calculateEndOfMonthProjection(dataset: WalletDataset, dailySpend: number) {
  const remainingDays = Math.max(1, differenceInCalendarDays(endOfMonth(new Date()), new Date()) + 1);
  const balance = calculateVisibleBalance(dataset);

  return balance - dailySpend * remainingDays;
}

export function calculateAllowedDailySpend(dataset: WalletDataset) {
  const remainingDays = Math.max(1, differenceInCalendarDays(endOfMonth(new Date()), new Date()) + 1);
  const balance = calculateVisibleBalance(dataset);

  return balance / remainingDays;
}

export function buildSavingsRecommendations(dataset: WalletDataset) {
  const summary = calculateSummary(dataset, monthKey(new Date()));
  const allowedDaily = calculateAllowedDailySpend(dataset);
  const recommendations = [
    `Average daily spending: ${formatMoney(
      summary.dailyAverageExpense,
      dataset.settings.primaryCurrency,
    )}.`,
    `Estimated daily allowance: ${formatMoney(
      allowedDaily,
      dataset.settings.primaryCurrency,
    )}.`,
  ];

  if (summary.dailyAverageExpense > allowedDaily) {
    recommendations.push("Average daily spending is above the estimated daily allowance.");
  }

  if (summary.cashFlow < 0) {
    recommendations.push("This month's cash flow is negative; review variable expenses.");
  }

  return recommendations;
}
