import { MutationObserver } from "@tanstack/react-query";

import type { QueryClient } from "@tanstack/react-query";
import type { apiOperations, OperationResponse } from "@shared/api-contract";
import type { ClientInput, WalletClient } from "./api-client";

type Operation = (typeof apiOperations)[number];
export type MutationOperationId = Exclude<
  Extract<
    Operation,
    { auth: "session"; method: "POST" | "PUT" | "PATCH" | "DELETE" }
  >["operationId"],
  "wallet.bootstrap" | "wallet.bootstrapReference"
>;
const financial = [
  "reference",
  "records",
  "analytics",
  "account-balances",
  "goal-progress",
  "goal-ledger",
  "card-summary",
  "card-statements",
  "card-records",
  "card-payments",
  "attention",
] as const;
const catalog = ["reference", "analytics", "account-balances", "goal-progress"] as const;
const card = [
  "reference",
  "analytics",
  "account-balances",
  "card-summary",
  "card-statements",
  "card-records",
  "card-payments",
  "attention",
] as const;
/** Adding a contract mutation requires an explicit cache policy at compile time. */
export const mutationDefinitions = {
  "settings.replace": catalog,
  "settings.patch": ["reference", "analytics", "account-balances", "goal-progress"],
  "accounts.create": catalog,
  "accounts.patch": catalog,
  "accounts.delete": financial,
  "categories.create": ["reference", "analytics"],
  "categories.patch": ["reference", "analytics"],
  "categories.delete": financial,
  "tags.create": ["reference", "analytics"],
  "tags.patch": ["reference", "analytics"],
  "tags.delete": financial,
  "recordTemplates.create": ["reference"],
  "recordTemplates.patch": ["reference"],
  "recordTemplates.delete": ["reference"],
  "records.create": financial,
  "records.patch": financial,
  "records.delete": financial,
  "records.import": financial,
  "cards.create": card,
  "cards.patch": card,
  "cards.delete": financial,
  "cards.refreshStatements": card,
  "cardRecords.create": financial,
  "cardRecords.patch": financial,
  "cardRecords.delete": financial,
  "cardRecords.refund": financial,
  "cardPayments.create": financial,
  "cardPayments.delete": financial,
  "cardStatements.pay": financial,
  "goals.create": catalog,
  "goals.patch": financial,
  "goals.delete": financial,
  "goalReservations.create": ["reference", "account-balances", "goal-progress", "goal-ledger"],
  "goalReservations.delete": ["reference", "account-balances", "goal-progress", "goal-ledger"],
  "goalReservations.release": ["reference", "account-balances", "goal-progress", "goal-ledger"],
  "budgets.create": ["reference", "analytics"],
  "budgets.patch": ["reference", "analytics"],
  "budgets.delete": ["reference", "analytics"],
  "investments.create": ["reference", "analytics"],
  "investments.patch": ["reference", "analytics"],
  "investments.delete": ["reference", "analytics"],
  "installmentPlans.create": ["reference"],
  "installmentPlans.patch": ["reference"],
  "installmentPlans.delete": ["reference"],
  "debts.create": ["reference", "analytics", "attention"],
  "debts.patch": ["reference", "analytics", "attention"],
  "debts.delete": ["reference", "analytics", "attention"],
  "debts.pay": financial,
  "debts.generateRecurring": ["reference", "attention"],
  "recurringDebts.create": ["reference"],
  "recurringDebts.patch": ["reference"],
  "recurringDebts.delete": ["reference"],
  "wallet.restore": financial,
  "auth.lockAll": [],
} as const satisfies Record<MutationOperationId, readonly string[]>;
export type WalletMutations = {
  [Id in MutationOperationId]: (input: ClientInput<Id>) => Promise<OperationResponse<Id>>;
};
export function createWalletMutations(client: WalletClient, cache: QueryClient): WalletMutations {
  function method<Id extends MutationOperationId>(operationId: Id) {
    return async (input: ClientInput<Id>): Promise<OperationResponse<Id>> => {
      // The contract ties this indexed method to its input/output; TS cannot preserve
      // that correlation while indexing a union of function signatures.
      const call = client[operationId];
      const observer = new MutationObserver(cache, {
        mutationKey: ["wallet-mutation", operationId],
        retry: false,
        mutationFn: call,
        // Invalidation alone can join an initial GET with no cached data. Cancel
        // its result before writing, so settlement always reads canonical state.
        onMutate: async () => {
          await Promise.all(
            mutationDefinitions[operationId].map((key) => cache.cancelQueries({ queryKey: [key] })),
          );
        },
        onSettled: async () => {
          await Promise.all(
            mutationDefinitions[operationId].map((key) =>
              cache.invalidateQueries({ queryKey: [key] }),
            ),
          );
        },
      });
      try {
        return await observer.mutate(input);
      } finally {
        observer.reset();
      }
    };
  }
  return Object.fromEntries(
    (Object.keys(mutationDefinitions) as MutationOperationId[]).map((id) => [id, method(id)]),
  ) as WalletMutations;
}
