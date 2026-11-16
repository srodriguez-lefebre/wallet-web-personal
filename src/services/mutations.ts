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
  "category-usage",
  "categories",
  "records",
  "analytics",
  "account-balances",
  "goal-progress",
  "goal-ledger",
  "card-summary",
  "card-statements",
  "card-records",
  "card-payments",
  "card-ledger",
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
  "card-ledger",
  "attention",
] as const;
/** Adding a contract mutation requires an explicit cache policy at compile time. */
export const mutationDefinitions = {
  "settings.replace": catalog,
  "settings.patch": ["reference", "analytics", "account-balances", "goal-progress"],
  "accounts.create": catalog,
  "accounts.patch": catalog,
  "accounts.delete": financial,
  "categories.create": ["reference", "analytics", "category-usage", "categories", "records"],
  "categories.patch": ["reference", "analytics", "records", "card-summary", "categories"],
  "categories.delete": financial,
  "categories.merge": financial,
  "tags.create": ["reference", "analytics"],
  "tags.patch": ["reference", "analytics", "records"],
  "tags.delete": financial,
  "recordTemplates.create": ["reference", "category-usage"],
  "recordTemplates.patch": ["reference", "category-usage"],
  "recordTemplates.delete": ["reference", "category-usage"],
  "records.create": financial,
  "records.patch": financial,
  "records.delete": financial,
  "records.import": financial,
  "cards.create": card,
  "cards.patch": card,
  "cards.replaceMailSettings": ["card-mail-settings"],
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
  "budgets.create": ["reference", "analytics", "category-usage"],
  "budgets.patch": ["reference", "analytics", "category-usage"],
  "budgets.delete": ["reference", "analytics", "category-usage"],
  "investments.create": ["reference", "analytics"],
  "investments.patch": ["reference", "analytics"],
  "investments.delete": ["reference", "analytics"],
  "installmentPlans.create": ["reference", "category-usage"],
  "installmentPlans.patch": ["reference", "category-usage"],
  "installmentPlans.delete": ["reference", "category-usage"],
  "debts.create": ["reference", "analytics", "attention", "category-usage"],
  "debts.patch": ["reference", "analytics", "attention", "category-usage"],
  "debts.delete": ["reference", "analytics", "attention", "category-usage"],
  "debts.pay": financial,
  "debts.generateRecurring": ["reference", "attention", "category-usage"],
  "recurringDebts.create": ["reference", "category-usage"],
  "recurringDebts.patch": ["reference", "category-usage"],
  "recurringDebts.delete": ["reference", "category-usage"],
  "wallet.restore": [...financial, "card-mail-settings"],
  "auth.lockAll": [],
} as const satisfies Record<MutationOperationId, readonly string[]>;
export type WalletMutations = {
  [Id in MutationOperationId]: (input: ClientInput<Id>) => Promise<OperationResponse<Id>>;
};

interface WriteState {
  pending: Set<Promise<unknown>>;
  fence: Promise<unknown>;
  listeners: Set<() => void>;
}
const writes = new WeakMap<QueryClient, WriteState>();
function writeState(cache: QueryClient): WriteState {
  let state = writes.get(cache);
  if (!state) {
    state = { pending: new Set(), fence: Promise.resolve(), listeners: new Set() };
    writes.set(cache, state);
  }
  return state;
}

/** Restore drains earlier requests, including delayed transport, and gates later writes. */
function orderedWrite<T>(cache: QueryClient, restore: boolean, work: () => Promise<T>): Promise<T> {
  const state = writeState(cache);
  const before = restore ? [state.fence, ...state.pending] : [state.fence];
  const result = Promise.allSettled(before).then(work);
  state.pending.add(result);
  if (restore)
    state.fence = result.then(
      () => {},
      () => {},
    );
  const finish = () => {
    state.pending.delete(result);
    state.listeners.forEach((listener) => listener());
  };
  void result.then(finish, finish);
  return result;
}

export function waitForWalletMutations(cache: QueryClient, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const mutations = cache.getMutationCache();
  const state = writeState(cache);
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const cleanup = () => {
      unsubscribe();
      state.listeners.delete(check);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Session ended", "AbortError"));
    };
    const check = () => {
      if (
        state.pending.size === 0 &&
        !mutations
          .getAll()
          .some(
            (mutation) =>
              mutation.state.status === "pending" &&
              mutation.options.mutationKey?.[0] === "wallet-mutation",
          )
      ) {
        cleanup();
        resolve();
      }
    };
    unsubscribe = mutations.subscribe(check);
    state.listeners.add(check);
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}
export function createWalletMutations(
  client: WalletClient,
  cache: QueryClient,
  options: { signal?: AbortSignal } = {},
): WalletMutations {
  function method<Id extends MutationOperationId>(operationId: Id) {
    return async (input: ClientInput<Id>): Promise<OperationResponse<Id>> => {
      const signal =
        options.signal && input.signal
          ? AbortSignal.any([options.signal, input.signal])
          : (options.signal ?? input.signal);
      signal?.throwIfAborted();
      return orderedWrite(cache, operationId === "wallet.restore", async () => {
        signal?.throwIfAborted();
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
            options.signal?.throwIfAborted();
            await Promise.all(
              mutationDefinitions[operationId].map((key) =>
                cache.cancelQueries({ queryKey: [key] }),
              ),
            );
          },
          onSettled: async () => {
            if (options.signal?.aborted) return;
            await Promise.all(
              mutationDefinitions[operationId].map((key) =>
                cache.invalidateQueries({ queryKey: [key] }),
              ),
            );
          },
        });
        try {
          return await observer.mutate({ ...input, signal });
        } finally {
          observer.reset();
        }
      });
    };
  }
  return Object.fromEntries(
    (Object.keys(mutationDefinitions) as MutationOperationId[]).map((id) => [id, method(id)]),
  ) as WalletMutations;
}
