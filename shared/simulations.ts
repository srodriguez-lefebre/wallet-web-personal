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
    `Gasto promedio diario: ${formatMoney(
      summary.dailyAverageExpense,
      dataset.settings.primaryCurrency,
    )}.`,
    `Disponible diario estimado: ${formatMoney(
      allowedDaily,
      dataset.settings.primaryCurrency,
    )}.`,
  ];

  if (summary.dailyAverageExpense > allowedDaily) {
    recommendations.push("El gasto diario promedio supera el disponible diario estimado.");
  }

  if (summary.cashFlow < 0) {
    recommendations.push("El cash flow del mes esta negativo; conviene revisar gastos variables.");
  }

  return recommendations;
}
