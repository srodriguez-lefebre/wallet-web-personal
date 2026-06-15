import {
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
} from "date-fns";
import type {
  Account,
  AccountBalance,
  AnalyticsSummary,
  Budget,
  BudgetProgress,
  CurrencyCode,
  GoalProgress,
  WalletDataset,
  WalletRecord,
} from "./types";

export function toPrimaryCurrency(amount: number, recordRate = 1) {
  return amount * recordRate;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale = "es-UY",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "UYU" ? 0 : 2,
  }).format(amount);
}

export function monthKey(date: string | Date) {
  return format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM");
}

export function recordsForMonth(records: WalletRecord[], month: string) {
  return records.filter((record) => monthKey(record.occurredAt) === month);
}

export function isRecordInRange(
  record: WalletRecord,
  from?: string,
  to?: string,
) {
  const date = parseISO(record.occurredAt);
  const afterFrom = from ? !isBefore(date, parseISO(from)) : true;
  const beforeTo = to ? !isAfter(date, parseISO(to)) : true;
  return afterFrom && beforeTo;
}

export function calculateAccountBalances(dataset: WalletDataset): AccountBalance[] {
  return dataset.accounts.map((account) => {
    const balance = dataset.records.reduce((total, record) => {
      if (record.paymentStatus === "cancelled") return total;

      if (record.type === "income" && record.accountId === account.id) {
        return total + record.amount;
      }

      if (record.type === "expense" && record.accountId === account.id) {
        return total - record.amount;
      }

      if (record.type === "transfer") {
        if (record.accountId === account.id) return total - record.amount;
        if (record.destinationAccountId === account.id) return total + record.amount;
      }

      return total;
    }, account.initialBalance);

    const reserved = dataset.goalReservations
      .filter((reservation) => reservation.accountId === account.id)
      .reduce((total, reservation) => total + reservation.amount, 0);

    const balanceInPrimary = convertAccountBalanceToPrimary(
      account,
      balance,
      dataset,
    );

    return {
      account,
      balance,
      balanceInPrimary,
      reserved,
      freeBalance: balance - reserved,
    };
  });
}

function convertAccountBalanceToPrimary(
  account: Account,
  balance: number,
  dataset: WalletDataset,
) {
  if (account.currency === dataset.settings.primaryCurrency) return balance;

  const rate = dataset.exchangeRates.find(
    (item) =>
      item.fromCurrency === account.currency &&
      item.toCurrency === dataset.settings.primaryCurrency,
  );

  return balance * (rate?.rate ?? 1);
}

export function calculateVisibleBalance(dataset: WalletDataset) {
  return calculateAccountBalances(dataset)
    .filter(({ account }) => account.isVisible)
    .reduce((total, item) => total + item.balanceInPrimary, 0);
}

export function calculateSummary(
  dataset: WalletDataset,
  month = monthKey(new Date()),
): AnalyticsSummary {
  const records = recordsForMonth(dataset.records, month).filter(
    (record) => record.paymentStatus !== "cancelled",
  );

  const income = records
    .filter((record) => record.type === "income")
    .reduce(
      (total, record) =>
        total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
      0,
    );

  const expenses = records
    .filter((record) => record.type === "expense")
    .reduce(
      (total, record) =>
        total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
      0,
    );

  const now = new Date();
  const monthEnd = endOfMonth(now);
  const dayOfMonth = Math.max(1, now.getDate());
  const remainingDays = Math.max(1, monthEnd.getDate() - now.getDate() + 1);
  const balance = calculateVisibleBalance(dataset);
  const dailyAverageExpense = expenses / dayOfMonth;
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
  month = monthKey(new Date()),
) {
  const records = recordsForMonth(dataset.records, month).filter(
    (record) => record.type === "expense" && record.paymentStatus !== "cancelled",
  );

  return dataset.categories
    .filter((category) => category.type === "expense")
    .map((category) => {
      const value = records
        .filter((record) => record.categoryId === category.id)
        .reduce(
          (total, record) =>
            total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
          0,
        );

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        value,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function calculateGoalProgress(dataset: WalletDataset): GoalProgress[] {
  return dataset.goals.map((goal) => {
    const reserved = dataset.goalReservations
      .filter((reservation) => reservation.goalId === goal.id)
      .reduce((total, reservation) => total + reservation.amount, 0);

    const spent = dataset.records
      .filter(
        (record) =>
          record.type === "expense" &&
          record.paymentStatus !== "cancelled" &&
          record.tagIds.some((tagId) => goal.tagIds.includes(tagId)),
      )
      .reduce(
        (total, record) =>
          total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
        0,
      );

    const committed = reserved + spent;
    const remaining = Math.max(0, goal.targetAmount - committed);
    const percentage = Math.min(100, (committed / goal.targetAmount) * 100);

    return {
      goal,
      reserved,
      spent,
      committed,
      remaining,
      percentage,
    };
  });
}

export function calculateBudgetProgress(
  dataset: WalletDataset,
  month = monthKey(new Date()),
): BudgetProgress[] {
  return dataset.budgets
    .filter((budget) => budget.isActive)
    .map((budget) => {
      const spent = matchingBudgetRecords(dataset.records, budget, month).reduce(
        (total, record) =>
          total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
        0,
      );
      const percentage = Math.min(999, (spent / budget.limitAmount) * 100);
      const remaining = budget.limitAmount - spent;
      const status =
        percentage >= 100 ? "exceeded" : percentage >= 80 ? "warning" : "ok";

      return {
        budget,
        spent,
        remaining,
        percentage,
        status,
      };
    });
}

function matchingBudgetRecords(
  records: WalletRecord[],
  budget: Budget,
  month: string,
) {
  return recordsForMonth(records, month).filter((record) => {
    if (record.type !== "expense" || record.paymentStatus === "cancelled") {
      return false;
    }

    if (budget.categoryId && record.categoryId !== budget.categoryId) {
      return false;
    }

    if (budget.tagId && !record.tagIds.includes(budget.tagId)) {
      return false;
    }

    if (budget.accountId && record.accountId !== budget.accountId) {
      return false;
    }

    return true;
  });
}

export function groupRecordsByDay(records: WalletRecord[]) {
  return records.reduce<Record<string, WalletRecord[]>>((groups, record) => {
    const key = format(parseISO(record.occurredAt), "yyyy-MM-dd");
    groups[key] = groups[key] ?? [];
    groups[key].push(record);
    return groups;
  }, {});
}

export function calculateMonthlySeries(dataset: WalletDataset, months: string[]) {
  return months.map((month) => {
    const summary = calculateSummary(dataset, month);
    return {
      month,
      income: summary.income,
      expenses: summary.expenses,
      cashFlow: summary.cashFlow,
    };
  });
}
