import { findExchangeRate } from "./money.js";
import { isFinancialRecord } from "./record-status.js";

import type { WalletDataset, GoalProgress, CurrencyCode, WalletRecord } from "./types.js";

export function calculateGoalProgress(dataset: WalletDataset, now: Date): GoalProgress[] {
  return dataset.goals.map((goal) => {
    let hasMissingExchangeRate = false;
    const convert = (amount: number, currency: CurrencyCode, record?: WalletRecord) => {
      if (amount === 0 || currency === goal.currency) return amount;
      if (record) {
        const account = dataset.accounts.find((item) => item.id === record.accountId);
        if (
          account?.currency === goal.currency &&
          record.accountAmount !== undefined &&
          Number.isFinite(record.accountAmount) &&
          record.accountAmount > 0
        ) {
          return (record.accountAmount * amount) / record.amount;
        }
        if (goal.currency === dataset.settings.primaryCurrency) {
          if (!Number.isFinite(record.exchangeRateToPrimary) || record.exchangeRateToPrimary <= 0) {
            hasMissingExchangeRate = true;
            return Number.NaN;
          }
          return amount * record.exchangeRateToPrimary;
        }
      }
      const rate = findExchangeRate(
        dataset.exchangeRates,
        currency,
        goal.currency,
        record?.occurredAt ?? now,
      );
      if (rate !== null) return amount * rate;
      hasMissingExchangeRate = true;
      return Number.NaN;
    };
    const reserved = dataset.goalReservations
      .filter((reservation) => reservation.goalId === goal.id)
      .reduce((total, reservation) => total + convert(reservation.amount, reservation.currency), 0);

    const netSpent = dataset.records
      .filter(
        (record) =>
          (record.type === "expense" || record.type === "income") &&
          isFinancialRecord(record) &&
          (record.goalIds ?? []).includes(goal.id),
      )
      .reduce((total, record) => {
        const association = (record.goalAssociations ?? []).find((item) => item.goalId === goal.id);
        const amount = association?.allocatedAmount ?? record.amount;
        return (
          total + (record.type === "expense" ? 1 : -1) * convert(amount, record.currency, record)
        );
      }, 0);
    const spent = Math.max(0, netSpent);

    const committed = reserved + spent;
    const remaining = Math.max(0, goal.targetAmount - committed);
    const overTarget = Math.max(0, committed - goal.targetAmount);
    const percentage = (committed / goal.targetAmount) * 100;

    return {
      goal,
      hasMissingExchangeRate,
      reserved,
      spent,
      committed,
      remaining,
      overTarget,
      percentage,
    };
  });
}
