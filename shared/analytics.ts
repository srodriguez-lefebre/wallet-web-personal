import { endOfMonth, parseISO, differenceInCalendarDays, isBefore, isAfter } from "date-fns";

import { isPrimaryReportingRecord } from "./record-status.js";
import {
  relativeMonthKeys,
  monthKey,
  recordsForMonth,
  recordsForDateRange,
  dateKeysForRange,
} from "./dates.js";
import {
  calculateAccountBalances,
  convertAccountBalanceToPrimary,
  calculateVisibleBalance,
} from "./balances.js";
import { toPrimaryCurrency } from "./money.js";
import { isCategoryOrDescendant } from "./categories.js";

import type { WalletDataset, AnalyticsSummary, DateRange, WalletRecord } from "./types.js";

export function calculateSavingsRate(income: number, expenses: number) {
  if (income <= 0) return 0;
  return ((income - expenses) / income) * 100;
}

export function calculateEmergencyRunway(
  dataset: WalletDataset,
  referenceMonth: string,
  averagingMonths = 3,
  now: Date,
) {
  const expenseMonths = relativeMonthKeys(referenceMonth, averagingMonths + 1).slice(
    0,
    averagingMonths,
  );
  const averageMonthlyExpenses =
    expenseMonths.reduce(
      (total, month) => total + calculateSummary(dataset, month, now).expenses,
      0,
    ) / averagingMonths;
  const freeBalance = calculateAccountBalances(dataset, now)
    .filter(({ account }) => account.isActive && account.isVisible)
    .reduce(
      (total, item) =>
        total + convertAccountBalanceToPrimary(item.account, item.freeBalance, dataset, now),
      0,
    );

  return {
    averageMonthlyExpenses,
    freeBalance,
    months: averageMonthlyExpenses > 0 ? Math.max(0, freeBalance) / averageMonthlyExpenses : 0,
    expenseMonths,
  };
}

export function calculateSummary(
  dataset: WalletDataset,
  month: string | undefined,
  now: Date,
): AnalyticsSummary {
  month ??= monthKey(now);
  const records = recordsForMonth(dataset.records, month).filter((record) =>
    isPrimaryReportingRecord(record),
  );
  const monthEnd = endOfMonth(parseISO(`${month}-01T12:00:00`));
  const isCurrentMonth = month === monthKey(now);
  const dayOfMonth = isCurrentMonth ? Math.max(1, now.getDate()) : monthEnd.getDate();
  const remainingDays = isCurrentMonth ? Math.max(1, monthEnd.getDate() - now.getDate() + 1) : 1;

  return calculateSummaryFromRecords(dataset, records, dayOfMonth, remainingDays, now);
}

export function calculateSummaryForDateRange(
  dataset: WalletDataset,
  range: DateRange,
  now: Date,
): AnalyticsSummary {
  const records = recordsForDateRange(dataset.records, range).filter((record) =>
    isPrimaryReportingRecord(record),
  );
  const from = parseISO(`${range.from}T12:00:00.000Z`);
  const to = parseISO(`${range.to}T12:00:00.000Z`);
  const dayCount = Math.max(1, differenceInCalendarDays(to, from) + 1);
  const remainingDays =
    isBefore(now, from) || isAfter(now, to)
      ? 1
      : Math.max(1, differenceInCalendarDays(to, now) + 1);

  return calculateSummaryFromRecords(dataset, records, dayCount, remainingDays, now);
}

export function calculateSummaryFromRecords(
  dataset: WalletDataset,
  records: WalletRecord[],
  dayCount: number,
  remainingDays: number,
  now: Date,
): AnalyticsSummary {
  const income = records
    .filter((record) => record.type === "income")
    .reduce(
      (total, record) => total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
      0,
    );

  const expenses = records
    .filter((record) => record.type === "expense")
    .reduce(
      (total, record) => total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
      0,
    );

  const balance = calculateVisibleBalance(dataset, now);
  const dailyAverageExpense = expenses / dayCount;
  const availableDaily = balance / remainingDays;

  return {
    income,
    expenses,
    cashFlow: income - expenses,
    balance,
    spending: expenses,
    dailyAverageExpense,
    availableDaily,
  };
}

export function calculateCategoryExpenses(
  dataset: WalletDataset,
  month: string | undefined,
  parentId: string | undefined,
  now: Date,
) {
  month ??= monthKey(now);
  const records = recordsForMonth(dataset.records, month).filter(
    (record) => record.type === "expense" && isPrimaryReportingRecord(record),
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryExpensesForDateRange(
  dataset: WalletDataset,
  range: DateRange,
  parentId?: string,
) {
  const records = recordsForDateRange(dataset.records, range).filter(
    (record) => record.type === "expense" && isPrimaryReportingRecord(record),
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryIncome(
  dataset: WalletDataset,
  month: string | undefined,
  parentId: string | undefined,
  now: Date,
) {
  month ??= monthKey(now);
  const records = recordsForMonth(dataset.records, month).filter(
    (record) => record.type === "income" && isPrimaryReportingRecord(record),
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryIncomeForDateRange(
  dataset: WalletDataset,
  range: DateRange,
  parentId?: string,
) {
  const records = recordsForDateRange(dataset.records, range).filter(
    (record) => record.type === "income" && isPrimaryReportingRecord(record),
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryBreakdownFromRecords(
  dataset: WalletDataset,
  records: WalletRecord[],
  parentId?: string,
) {
  return dataset.categories
    .filter((category) => (parentId ? category.parentId === parentId : !category.parentId))
    .map((category) => {
      const value = records
        .filter(
          (record) =>
            record.categoryId &&
            isCategoryOrDescendant(dataset.categories, record.categoryId, category.id),
        )
        .reduce(
          (total, record) => total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
          0,
        );

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        value,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function buildExpenseComparisonSeries(dataset: WalletDataset, ranges: DateRange[]) {
  const [twoPeriodsAgo, previous, current] = ranges.map((range) =>
    dateKeysForRange(range).map((date) =>
      recordsForDateRange(dataset.records, { from: range.from, to: date })
        .filter((record) => record.type === "expense" && isPrimaryReportingRecord(record))
        .reduce(
          (total, record) => total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
          0,
        ),
    ),
  );
  const maxDays = Math.max(twoPeriodsAgo?.length ?? 0, previous?.length ?? 0, current?.length ?? 0);
  return Array.from({ length: maxDays }, (_, index) => ({
    day: `Day ${index + 1}`,
    previousPrevious: twoPeriodsAgo?.[index] ?? null,
    previous: previous?.[index] ?? null,
    current: current?.[index] ?? null,
  }));
}

export function buildExpenseSequenceComparisonSeries(dataset: WalletDataset, ranges: DateRange[]) {
  const [twoPeriodsAgo = [], previous = [], current = []] = ranges.map((range) => {
    let cumulative = 0;
    return recordsForDateRange(dataset.records, range)
      .filter((record) => record.type === "expense" && isPrimaryReportingRecord(record))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
      .map((record) => {
        cumulative += toPrimaryCurrency(record.amount, record.exchangeRateToPrimary);
        return cumulative;
      });
  });
  const maxExpenses = Math.max(twoPeriodsAgo.length, previous.length, current.length);
  return Array.from({ length: maxExpenses }, (_, index) => ({
    expense: `Expense ${index + 1}`,
    previousPrevious: twoPeriodsAgo[index] ?? null,
    previous: previous[index] ?? null,
    current: current[index] ?? null,
  }));
}

export function calculateMonthlySeries(dataset: WalletDataset, months: string[], now: Date) {
  return months.map((month) => {
    const summary = calculateSummary(dataset, month, now);
    return {
      month,
      income: summary.income,
      expenses: summary.expenses,
      cashFlow: summary.cashFlow,
    };
  });
}
