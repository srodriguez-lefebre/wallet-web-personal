import { useQueryClient } from "@tanstack/react-query";
import { dateKey, dateRangeForMonth } from "@shared/calculations";
import { useCallback, useMemo } from "react";

import { useWalletReferenceQuery } from "./wallet-entities";

import type { WalletReference } from "@shared/reference-contract";
import type { WalletDataset } from "@shared/types";

import { defaultRecordAccountId } from "@/lib/record-draft";
import { useWalletData } from "@/providers/wallet-query-provider";
import { useWalletUIActions, useWalletUIState } from "@/providers/wallet-ui-provider";
import { createWalletActions } from "@/services/wallet-actions";
import { waitForWalletMutations } from "@/services/mutations";
import { referenceKey } from "@/services/wallet-queries";

const archivedFilters = { Account: "accountId", Category: "categoryId", Tag: "tagId" } as const;

/** A reference-only facade for forms. Financial history and aggregates use entity hooks. */
export function useWallet() {
  const reference = useWalletReferenceQuery().data;
  const cache = useQueryClient();
  const { client, mutations, signal } = useWalletData();
  const state = useWalletUIState();
  const ui = useWalletUIActions();
  const actions = useMemo(
    () =>
      createWalletActions(client, mutations, {
        signal,
        waitForWrites: () => waitForWalletMutations(cache, signal),
        getReference: () => {
          signal.throwIfAborted();
          const current = cache.getQueryData<WalletReference>(referenceKey);
          if (!current) throw new Error("Reload Wallet before continuing");
          return current;
        },
        onArchived: (entity, id) => ui.clearArchivedFilter(archivedFilters[entity], id),
      }),
    [client, mutations, signal, cache, ui],
  );
  const dataset = useMemo<WalletDataset | undefined>(
    () =>
      reference
        ? {
            ...reference,
            records: [],
            creditCardRecords: [],
            creditCardStatements: [],
            creditCardPayments: [],
            creditCardPaymentAllocations: [],
            goalReservationMovements: [],
          }
        : undefined,
    [reference],
  );
  const defaultAccountId = dataset ? defaultRecordAccountId(dataset) : undefined;
  const requestNewRecord = useCallback(
    (templateId?: string) => ui.requestNewRecord({ templateId, accountId: defaultAccountId }),
    [ui, defaultAccountId],
  );
  if (!reference || !dataset) throw new Error("Wallet consumers must mount after bootstrap");
  const today = dateKey(new Date());
  const selectedDateRange =
    state.selectedPeriodMode === "month"
      ? dateRangeForMonth(state.selectedMonth)
      : state.selectedPeriodMode === "custom"
        ? state.customDateRange
        : { from: reference.recordSummary.from ?? today, to: reference.recordSummary.to ?? today };
  return {
    ...state,
    ...ui,
    ...actions,
    dataset,
    selectedDateRange,
    isReviewQueueOpen: state.reviewReturnContext !== null,
    requestNewRecord,
    availableMonths: reference.recordSummary.months,
    recordSummary: reference.recordSummary,
    merchantCorrections: reference.merchantCorrections,
    debtRecordCounts: reference.debtRecordCounts,
  };
}
