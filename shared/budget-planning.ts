import { monthKey, relativeMonthKeys } from "./calculations.js";
import { isFinancialRecord } from "./record-status.js";
import type { Budget, Category, CurrencyCode, WalletDataset } from "./types.js";

export interface BudgetProposal {
  categoryId: string;
  name: string;
  color: string;
  monthlyAmounts: Array<number | null>;
  total: number | null;
  average: number | null;
  limitAmount: number | null;
  status: "ready" | "conflict" | "missing_exchange_rate";
  conflictingBudgetIds: string[];
}

export interface BudgetPlan {
  targetMonth: string;
  sourceMonths: string[];
  currency: CurrencyCode;
  proposals: BudgetProposal[];
}

function categoryPath(categories: Category[], id: string): Category[] {
  const path: Category[] = [];
  const seen = new Set<string>();
  let current = categories.find((category) => category.id === id);
  while (current && !seen.has(current.id)) {
    path.push(current);
    seen.add(current.id);
    current = current.parentId
      ? categories.find((category) => category.id === current!.parentId)
      : undefined;
  }
  return path;
}

/** Categories overlap whenever either budget would include the other's records. */
export function conflictingCategoryBudgets(
  categories: Category[],
  budgets: Budget[],
  categoryId: string,
): Budget[] {
  const ancestors = new Set(
    categoryPath(categories, categoryId).map((category) => category.id),
  );
  return budgets.filter(
    (budget) =>
      budget.isActive &&
      budget.categoryId &&
      (ancestors.has(budget.categoryId) ||
        categoryPath(categories, budget.categoryId).some(
          (category) => category.id === categoryId,
        )),
  );
}

/** Caller supplies report-filtered history and unfiltered budgets for conflict checks. */
export function buildBudgetPlan(
  dataset: WalletDataset,
  targetMonth: string,
  headroomPercent: number,
  budgets = dataset.budgets,
  today = new Date(),
): BudgetPlan {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(targetMonth))
    throw new Error("Choose a valid target month.");
  if (targetMonth > monthKey(today))
    throw new Error(
      "Choose the current month or an earlier month so all source months are complete.",
    );
  if (
    !Number.isFinite(headroomPercent) ||
    headroomPercent < 0 ||
    headroomPercent > 100
  )
    throw new Error("Margin must be between 0 and 100%.");
  const sourceMonths = relativeMonthKeys(targetMonth, 4).slice(0, 3);
  const amounts = new Map<string, Array<number | null>>();
  const roots = new Map<string, Category>();
  for (const record of dataset.records) {
    if (
      record.type !== "expense" ||
      !isFinancialRecord(record) ||
      !record.categoryId ||
      !(record.amount > 0)
    )
      continue;
    const index = sourceMonths.indexOf(monthKey(record.occurredAt));
    if (index < 0) continue;
    const path = categoryPath(dataset.categories, record.categoryId);
    const category = path.at(-1);
    if (!category || category.parentId) continue;
    roots.set(category.id, category);
    const monthly = amounts.get(category.id) ?? [0, 0, 0];
    const rate =
      record.currency === dataset.settings.primaryCurrency
        ? 1
        : record.exchangeRateToPrimary;
    const amount = record.amount * rate;
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount))
      monthly[index] = null;
    else if (monthly[index] !== null) monthly[index] += amount;
    amounts.set(category.id, monthly);
  }
  const proposals = [...amounts]
    .map(([categoryId, monthlyAmounts]): BudgetProposal => {
      const category = roots.get(categoryId)!;
      const missingRate = monthlyAmounts.includes(null);
      const total = missingRate
        ? null
        : monthlyAmounts.reduce<number>(
            (sum, amount) => sum + (amount ?? 0),
            0,
          );
      const average = total === null ? null : total / 3;
      const rawCents =
        average === null ? null : average * (1 + headroomPercent / 100) * 100;
      // Discount only floating-point representation noise before rounding upward to cents.
      const limitAmount =
        rawCents === null
          ? null
          : Math.ceil(rawCents - Number.EPSILON * rawCents * 4) / 100;
      const conflictingBudgetIds = conflictingCategoryBudgets(
        dataset.categories,
        budgets,
        categoryId,
      ).map((budget) => budget.id);
      return {
        categoryId,
        name: category.name,
        color: category.color,
        monthlyAmounts,
        total,
        average,
        limitAmount,
        conflictingBudgetIds,
        status: missingRate
          ? "missing_exchange_rate"
          : conflictingBudgetIds.length
            ? "conflict"
            : "ready",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    targetMonth,
    sourceMonths,
    currency: dataset.settings.primaryCurrency,
    proposals,
  };
}
