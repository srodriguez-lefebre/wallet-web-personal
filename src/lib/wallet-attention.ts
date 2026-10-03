import { debtDueState, selectDebtsByDueDate } from "@shared/planning";
import type { WalletDataset } from "@shared/types";
import { selectPendingCardStatements } from "./cards-presentation";

/** Current attention items are independent of the selected reporting period. */
export function walletAttention(dataset: WalletDataset, asOf = new Date()) {
  return {
    review: dataset.records.filter(
      (record) => record.paymentStatus === "needs_review",
    ).length,
    debts: selectDebtsByDueDate(
      dataset.debts.filter((debt) => debt.isVisible),
      { asOf },
    ).filter((debt) => {
      const state = debtDueState(debt, asOf);
      return state.days !== null && state.days <= 7;
    }),
    statements: selectPendingCardStatements(dataset, asOf),
  };
}
