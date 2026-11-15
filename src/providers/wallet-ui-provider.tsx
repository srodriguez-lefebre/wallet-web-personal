import { createContext, useContext, useMemo, useReducer, type PropsWithChildren } from "react";

import type { DateRange, RecordFilters } from "@shared/types";
import type { WalletUIInitial } from "@/lib/wallet-ui-state";

import { createWalletUIState, walletUIReducer } from "@/lib/wallet-ui-state";

interface WalletUIActions {
  setSelectedMonth: (month: string) => void;
  setAllPeriod: () => void;
  setCustomDateRange: (range: DateRange) => void;
  setRecordFilters: (filters: RecordFilters) => void;
  clearRecordFilters: () => void;
  clearArchivedFilter: (key: "accountId" | "categoryId" | "tagId", id: string) => void;
  openReviewQueue: () => void;
  closeReviewQueue: () => void;
  requestNewRecord: (options?: { templateId?: string; accountId?: string }) => void;
  consumeNewRecordRequest: () => void;
}
const StateContext = createContext<ReturnType<typeof createWalletUIState> | null>(null);
const ActionsContext = createContext<WalletUIActions | null>(null);

/** UI selection only. Financial data and domain mutations belong to Query hooks. */
export function WalletUIProvider({ children, ...initial }: PropsWithChildren<WalletUIInitial>) {
  const [state, dispatch] = useReducer(walletUIReducer, initial, (input) =>
    createWalletUIState(input, new Date()),
  );
  const actions = useMemo<WalletUIActions>(
    () => ({
      setSelectedMonth: (month) => dispatch({ type: "month", month }),
      setAllPeriod: () => dispatch({ type: "all" }),
      setCustomDateRange: (range) => dispatch({ type: "custom", range }),
      setRecordFilters: (filters) => dispatch({ type: "filters", filters }),
      clearRecordFilters: () => dispatch({ type: "clear-filters" }),
      clearArchivedFilter: (key, id) => dispatch({ type: "archive-filter", key, id }),
      openReviewQueue: () => dispatch({ type: "open-review" }),
      closeReviewQueue: () => dispatch({ type: "close-review" }),
      requestNewRecord: (options = {}) =>
        dispatch({ type: "new-record", requestId: Date.now(), ...options }),
      consumeNewRecordRequest: () => dispatch({ type: "consume-new-record" }),
    }),
    [],
  );
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}
export function useWalletUIState() {
  const value = useContext(StateContext);
  if (!value) throw new Error("useWalletUIState requires WalletUIProvider");
  return value;
}
export function useWalletUIActions() {
  const value = useContext(ActionsContext);
  if (!value) throw new Error("useWalletUIActions requires WalletUIProvider");
  return value;
}
