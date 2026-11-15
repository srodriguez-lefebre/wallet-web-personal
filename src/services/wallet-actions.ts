import type { OperationResponse } from "@shared/api-contract";
import type { WalletReference } from "@shared/reference-contract";
import type { WalletRecord } from "@shared/types";
import type { ClientInput, WalletClient } from "./api-client";
import type { WalletMutations } from "./mutations";

import { importRecordBatches } from "@/lib/record-import";
import { createDebtPayment, createDebtSettlement } from "@/lib/debt-settlement";

// WalletMutations is owned by SessionQueries. Weak keys release retry payloads
// with that session, while separate facade consumers share the same identity.
const debtActions = new WeakMap<
  WalletMutations,
  {
    settleDebt: ReturnType<typeof createDebtSettlement>;
    recordDebtPayment: ReturnType<typeof createDebtPayment>;
  }
>();

const crud = {
  Account: ["accounts.create", "accounts.patch", "accounts.delete"],
  Category: ["categories.create", "categories.patch", "categories.delete"],
  CreditCard: ["cards.create", "cards.patch", "cards.delete"],
  Tag: ["tags.create", "tags.patch", "tags.delete"],
  Goal: ["goals.create", "goals.patch", "goals.delete"],
  Budget: ["budgets.create", "budgets.patch", "budgets.delete"],
  RecordTemplate: ["recordTemplates.create", "recordTemplates.patch", "recordTemplates.delete"],
  Investment: ["investments.create", "investments.patch", "investments.delete"],
  InstallmentPlan: ["installmentPlans.create", "installmentPlans.patch", "installmentPlans.delete"],
  Debt: ["debts.create", "debts.patch", "debts.delete"],
  RecurringDebt: ["recurringDebts.create", "recurringDebts.patch", "recurringDebts.delete"],
  Record: ["records.create", "records.patch", "records.delete"],
} as const;
type Name = keyof typeof crud;
type Body<Id extends keyof WalletClient> =
  ClientInput<Id> extends { body: infer Input } ? Input : never;
type CrudActions = {
  [Entity in Name as `add${Entity}`]: (body: Body<(typeof crud)[Entity][0]>) => Promise<string>;
} & {
  [Entity in Name as `update${Entity}`]: (
    id: string,
    body: Body<(typeof crud)[Entity][1]>,
  ) => Promise<Entity extends "Record" ? OperationResponse<"records.patch"> : void>;
} & {
  [Entity in Name as `delete${Entity}`]: (id: string) => Promise<void>;
};
export type ArchivedEntity = "Account" | "Category" | "Tag";
interface ActionOptions {
  signal: AbortSignal;
  getReference: () => WalletReference;
  onArchived: (entity: ArchivedEntity, id: string) => void;
  waitForWrites: () => Promise<void>;
}

/** Compatibility names are generated once; Query owns their invalidation and session lifecycle. */
export function createWalletActions(
  client: WalletClient,
  mutations: WalletMutations,
  options: ActionOptions,
) {
  let payments = debtActions.get(mutations);
  if (!payments) {
    payments = {
      settleDebt: createDebtSettlement(mutations["debts.pay"]),
      recordDebtPayment: createDebtPayment(mutations["debts.pay"]),
    };
    debtActions.set(mutations, payments);
  }
  const aliases = Object.fromEntries(
    (Object.keys(crud) as Name[]).flatMap((name) => {
      const [createId, patchId, deleteId] = crud[name];
      // Each fixed table entry names a contract-validated CRUD operation. Runtime
      // SDK validation retains the input/output correlation lost by union indexing.
      const create = mutations[createId] as (input: { body: unknown }) => Promise<{ id: string }>;
      const patch = mutations[patchId] as (input: {
        params: { id: string };
        body: unknown;
      }) => Promise<unknown>;
      const remove = mutations[deleteId];
      return [
        [`add${name}`, async (body: unknown) => (await create({ body })).id],
        [
          `update${name}`,
          async (id: string, body: unknown) => {
            const saved = await patch({ params: { id }, body });
            if (name === "Record") return saved;
          },
        ],
        [
          `delete${name}`,
          async (id: string) => {
            if (name === "Category") {
              const result = await mutations["categories.delete"]({ params: { id } });
              result.archivedCategoryIds.forEach((archivedId) =>
                options.onArchived("Category", archivedId),
              );
              return;
            }
            await remove({ params: { id } });
            if (name === "Account" || name === "Tag") options.onArchived(name, id);
          },
        ],
      ];
    }),
  ) as unknown as CrudActions;
  const getCompleteDataset = async () => {
    await options.waitForWrites();
    return client["wallet.get"]({ signal: options.signal });
  };
  const getBackupDataset = async () => {
    await options.waitForWrites();
    return client["wallet.backup"]({ signal: options.signal });
  };
  return {
    ...aliases,
    ...payments,
    getCompleteDataset,
    getBackupDataset,
    restoreBackup: async (body: Body<"wallet.restore">) => {
      await mutations["wallet.restore"]({ body });
    },
    importRecords: async (records: Array<Omit<WalletRecord, "id">>) => {
      const complete = await getCompleteDataset();
      return importRecordBatches(records, complete.records, (batch) =>
        mutations["records.import"]({ body: { records: batch } }),
      );
    },
    updateWalletSettings: async (body: Body<"settings.patch">) => {
      await mutations["settings.patch"]({ body });
    },
    refreshCardStatements: async () => {
      await mutations["cards.refreshStatements"]({});
    },
    addCreditCardPayment: async (id: string, body: Body<"cardPayments.create">) => {
      await mutations["cardPayments.create"]({ params: { id }, body });
    },
    addCreditCardRecord: async (id: string, body: Body<"cardRecords.create">) => {
      await mutations["cardRecords.create"]({ params: { id }, body });
    },
    addCreditCardRefund: async (id: string, body: Body<"cardRecords.refund">) => {
      await mutations["cardRecords.refund"]({ params: { id }, body });
    },
    updateCreditCardRecord: async (
      id: string,
      recordId: string,
      body: Body<"cardRecords.patch">,
    ) => {
      await mutations["cardRecords.patch"]({ params: { id, recordId }, body });
    },
    deleteCreditCardRecord: async (id: string, recordId: string) => {
      await mutations["cardRecords.delete"]({ params: { id, recordId } });
    },
    deleteCreditCardPayment: async (id: string, paymentId: string) => {
      await mutations["cardPayments.delete"]({ params: { id, paymentId } });
    },
    payCreditCardStatement: async (
      id: string,
      statementId: string,
      body: Body<"cardStatements.pay">,
    ) => {
      await mutations["cardStatements.pay"]({ params: { id, statementId }, body });
    },
    addGoalReservation: async (body: Body<"goalReservations.create">) => {
      await mutations["goalReservations.create"]({ body });
    },
    deleteGoalReservation: async (id: string) => {
      await mutations["goalReservations.delete"]({ params: { id } });
    },
    releaseGoalReservation: async (body: Body<"goalReservations.release">) => {
      await mutations["goalReservations.release"]({ body });
    },
    toggleAccountVisibility: async (id: string) => {
      const account = options.getReference().accounts.find((value) => value.id === id);
      if (account) await aliases.updateAccount(id, { isVisible: !account.isVisible });
    },
    setPrimaryAccount: async (id: string) => {
      await mutations["settings.patch"]({ body: { primaryAccountId: id } });
    },
  };
}
