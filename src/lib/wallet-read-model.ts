import { differenceInCalendarDays, endOfMonth, isAfter, isBefore, parseISO } from "date-fns";
import { calculateSavingsRate } from "@shared/analytics";
import { formatMoney } from "@shared/money";
import { monthKey } from "@shared/dates";

import type { AnalyticsResult } from "@shared/analytics-contract";
import type { AccountBalanceMetric, GoalProgressMetric } from "@shared/read-model-contract";
import type { WalletReference } from "@shared/reference-contract";
import type { ReportDetails, ReportQuery } from "@shared/report-contract";
import type { AccountBalance, AnalyticsSummary, Goal, GoalProgress } from "@shared/types";

type Reference = Pick<WalletReference, "accounts" | "settings"> & { goals: Goal[] };
const unknown = Number.NaN;

/** Missing conversions stay explicit, matching the existing presentation's NaN sentinel. */
export function accountBalancesFromMetrics(
  reference: Pick<Reference, "accounts">,
  metrics: readonly AccountBalanceMetric[],
): AccountBalance[] {
  const byId = new Map(metrics.map((item) => [item.accountId, item]));
  return reference.accounts.map((account) => {
    const metric = byId.get(account.id);
    return {
      account,
      balance: metric?.balance ?? unknown,
      totalBalance: metric?.totalBalance ?? unknown,
      reserved: metric?.reserved ?? unknown,
      freeBalance: metric?.freeBalance ?? unknown,
      balanceInPrimary: metric?.balanceInPrimary ?? unknown,
      totalBalanceInPrimary: metric?.totalBalanceInPrimary ?? unknown,
    };
  });
}

export function goalProgressFromMetrics(
  reference: Pick<Reference, "goals">,
  metrics: readonly GoalProgressMetric[],
): GoalProgress[] {
  const byId = new Map(metrics.map((item) => [item.goalId, item]));
  return reference.goals.map((goal) => {
    const metric = byId.get(goal.id);
    return {
      goal,
      hasMissingExchangeRate: metric?.hasMissingExchangeRate ?? true,
      reserved: metric?.reserved ?? unknown,
      spent: metric?.spent ?? unknown,
      committed: metric?.committed ?? unknown,
      remaining: metric?.remaining ?? unknown,
      overTarget: metric?.overTarget ?? unknown,
      percentage: metric?.percentage ?? unknown,
    };
  });
}

export function categoryBreakdown(
  totals: AnalyticsResult,
  type: "expense" | "income",
  parentId?: string,
) {
  return totals.categories
    .filter((category) => (parentId ? category.parentId === parentId : !category.parentId))
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      value: type === "expense" ? category.expenses : category.income,
    }))
    .filter((category) => category.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Only reference entities and aggregates enter this model; a record page cannot supply totals. */
export function buildReportViewModel(
  reference: Pick<Reference, "accounts" | "settings">,
  metrics: readonly AccountBalanceMetric[],
  totals: AnalyticsResult,
  details: ReportDetails,
  query: Pick<ReportQuery, "from" | "to" | "selectedMonth" | "periodMode" | "accountId">,
  now: Date,
) {
  const balances = accountBalancesFromMetrics(reference, metrics).filter(
    ({ account }) => account.isVisible && (!query.accountId || account.id === query.accountId),
  );
  const balance = balances.reduce((sum, item) => sum + item.balanceInPrimary, 0);
  const monthEnd = endOfMonth(parseISO(`${query.selectedMonth}-01T12:00:00`));
  const currentMonth = query.selectedMonth === monthKey(now);
  const from = parseISO(`${query.from}T12:00:00.000Z`);
  const to = parseISO(`${query.to}T12:00:00.000Z`);
  const dayCount =
    query.periodMode === "month"
      ? currentMonth
        ? Math.max(1, now.getDate())
        : monthEnd.getDate()
      : Math.max(1, differenceInCalendarDays(to, from) + 1);
  const remainingDays =
    query.periodMode === "month"
      ? currentMonth
        ? Math.max(1, monthEnd.getDate() - now.getDate() + 1)
        : 1
      : isBefore(now, from) || isAfter(now, to)
        ? 1
        : Math.max(1, differenceInCalendarDays(to, now) + 1);
  const summary: AnalyticsSummary = {
    income: totals.income,
    expenses: totals.expenses,
    cashFlow: totals.cashFlow,
    balance,
    spending: totals.expenses,
    dailyAverageExpense: totals.expenses / dayCount,
    availableDaily: balance / remainingDays,
  };
  const calendarDaysLeft = Math.max(1, differenceInCalendarDays(endOfMonth(now), now) + 1);
  const allowedDaily = balance / calendarDaysLeft;
  const projection = balance - summary.dailyAverageExpense * calendarDaysLeft;
  const freeBalance = balances
    .filter(({ account }) => account.isActive)
    .reduce((sum, item) => sum + item.balanceInPrimary, 0);
  const emergencyRunway = {
    averageMonthlyExpenses: details.averageMonthlyExpenses,
    freeBalance,
    months:
      details.averageMonthlyExpenses > 0
        ? Math.max(0, freeBalance) / details.averageMonthlyExpenses
        : 0,
    expenseMonths: details.expenseMonths,
  };
  const savingsRate = calculateSavingsRate(totals.income, totals.expenses);
  const previousSavingsRate = calculateSavingsRate(
    details.previousTotals.income,
    details.previousTotals.expenses,
  );
  const recommendations = [
    `Average daily spending: ${formatMoney(details.currentMonthTotals.expenses / Math.max(1, now.getDate()), reference.settings.primaryCurrency)}.`,
    `Estimated daily allowance: ${formatMoney(allowedDaily, reference.settings.primaryCurrency)}.`,
  ];
  if (details.currentMonthTotals.expenses / Math.max(1, now.getDate()) > allowedDaily)
    recommendations.push("Average daily spending is above the estimated daily allowance.");
  if (details.currentMonthTotals.cashFlow < 0)
    recommendations.push("This month's cash flow is negative; review variable expenses.");
  return {
    ...details,
    summary,
    savingsRate,
    previousSavingsRate,
    savingsRateChange: savingsRate - previousSavingsRate,
    emergencyRunway,
    allowedDaily,
    projection,
    recommendations,
    budgets: totals.budgets.map((budget) => ({
      ...budget,
      spent: budget.spent ?? unknown,
      remaining: budget.remaining ?? unknown,
      percentage: budget.percentage ?? unknown,
    })),
  };
}
