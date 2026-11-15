import { findExchangeRate } from "./money.js";

import type { Debt, WalletDataset, VisibleDebtSummary } from "./types.js";

export function isOpenDebt(debt: Debt) {
  return debt.status !== "paid" && (debt.pendingAmount === undefined || debt.pendingAmount > 0);
}

export function calculateVisibleDebtSummary(dataset: WalletDataset, now: Date): VisibleDebtSummary {
  return dataset.debts
    .filter((debt) => debt.isVisible && isOpenDebt(debt))
    .reduce<VisibleDebtSummary>(
      (summary, debt) => {
        const rate = findExchangeRate(
          dataset.exchangeRates,
          debt.currency,
          dataset.settings.primaryCurrency,
          now,
        );
        const pendingAmount =
          debt.pendingAmount === undefined || rate === null ? undefined : debt.pendingAmount * rate;

        if (pendingAmount === undefined) {
          return {
            ...summary,
            openCount: summary.openCount + 1,
            amountPendingCount: summary.amountPendingCount + 1,
          };
        }

        const toCollect =
          debt.direction === "receivable" ? summary.toCollect + pendingAmount : summary.toCollect;
        const toPay = debt.direction === "payable" ? summary.toPay + pendingAmount : summary.toPay;

        return {
          toCollect,
          toPay,
          net: toCollect - toPay,
          openCount: summary.openCount + 1,
          amountPendingCount: summary.amountPendingCount,
        };
      },
      {
        toCollect: 0,
        toPay: 0,
        net: 0,
        openCount: 0,
        amountPendingCount: 0,
      },
    );
}

export function applyDebtPayment(debt: Debt, amount: number): Debt {
  if (amount <= 0 || debt.pendingAmount === undefined) return debt;

  const pendingAmount = Math.max(0, debt.pendingAmount - amount);
  return {
    ...debt,
    pendingAmount,
    status: pendingAmount === 0 ? "paid" : debt.status,
  };
}
