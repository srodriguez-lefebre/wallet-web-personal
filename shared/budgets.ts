import { isPrimaryReportingRecord, isFinancialRecord } from "./record-status.js";
import { findExchangeRate } from "./money.js";
import { monthKey, recordsForMonth, recordsForDateRange } from "./dates.js";
import { toPrimaryCurrency } from "./money.js";
import { isCategoryOrDescendant } from "./categories.js";

import type {
  WalletDataset,
  BudgetProgress,
  DateRange,
  WalletRecord,
  Budget,
  Category,
} from "./types.js";

export function calculateBudgetProgress(
  dataset: WalletDataset,
  month: string | undefined,
  now: Date,
): BudgetProgress[] {
  month ??= monthKey(now);
  return calculateBudgetProgressFromRecords(dataset, recordsForMonth(dataset.records, month));
}

export function calculateBudgetProgressForDateRange(
  dataset: WalletDataset,
  range: DateRange,
): BudgetProgress[] {
  return calculateBudgetProgressFromRecords(dataset, recordsForDateRange(dataset.records, range));
}

export function calculateBudgetProgressFromRecords(
  dataset: WalletDataset,
  records: WalletRecord[],
): BudgetProgress[] {
  return dataset.budgets
    .filter((budget) => budget.isActive)
    .map((budget) => {
      const spent = matchingBudgetRecords(records, budget, dataset.categories).reduce(
        (total, record) => {
          const amount = budget.goalId
            ? (record.goalAssociations?.find((link) => link.goalId === budget.goalId)
                ?.allocatedAmount ?? record.amount)
            : record.amount;
          if (record.currency === budget.currency) return total + amount;
          if (budget.currency === dataset.settings.primaryCurrency)
            return (
              total +
              (isPrimaryReportingRecord(record)
                ? toPrimaryCurrency(amount, record.exchangeRateToPrimary)
                : Number.NaN)
            );
          const account = dataset.accounts.find((account) => account.id === record.accountId);
          if (account?.currency === budget.currency && record.accountAmount !== undefined)
            return total + (record.accountAmount * amount) / record.amount;
          const rate = findExchangeRate(
            dataset.exchangeRates,
            record.currency,
            budget.currency,
            record.occurredAt,
          );
          return total + (rate === null ? Number.NaN : amount * rate);
        },
        0,
      );
      const percentage = Math.min(999, (spent / budget.limitAmount) * 100);
      const remaining = budget.limitAmount - spent;
      const status = !Number.isFinite(spent)
        ? "warning"
        : percentage >= 100
          ? "exceeded"
          : percentage >= 80
            ? "warning"
            : "ok";

      return {
        budget,
        spent,
        remaining,
        percentage,
        status,
      };
    });
}

export function matchingBudgetRecords(
  records: WalletRecord[],
  budget: Budget,
  categories: Category[],
) {
  return records.filter((record) => {
    if (record.type !== "expense" || !isFinancialRecord(record)) {
      return false;
    }

    if (
      budget.categoryId &&
      (!record.categoryId ||
        !isCategoryOrDescendant(categories, record.categoryId, budget.categoryId))
    ) {
      return false;
    }

    if (budget.tagId && !record.tagIds.includes(budget.tagId)) {
      return false;
    }
    if (budget.goalId && !record.goalIds?.includes(budget.goalId)) return false;

    if (budget.accountId && record.accountId !== budget.accountId) {
      return false;
    }

    return true;
  });
}
