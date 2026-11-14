import { dateKey, monthKey } from "@shared/calculations";

import type { DateRange, RecordFilters } from "@shared/types";

export type PeriodMode = "month" | "custom" | "all";
interface Selection {
  recordFilters: RecordFilters;
  selectedMonth: string;
  selectedPeriodMode: PeriodMode;
  customDateRange: DateRange;
}
export interface WalletUIState extends Selection {
  newRecordRequestId: number;
  newRecordTemplateId: string | null;
  reviewReturnContext: Selection | null;
}
export interface WalletUIInitial {
  initialMonth?: string;
  initialAccountId?: string;
  initialCustomRange?: DateRange;
}
export type WalletUIAction =
  | { type: "month"; month: string }
  | { type: "all" }
  | { type: "custom"; range: DateRange }
  | { type: "filters"; filters: RecordFilters }
  | { type: "clear-filters" }
  | { type: "open-review" }
  | { type: "close-review" }
  | { type: "new-record"; requestId: number; accountId?: string; templateId?: string }
  | { type: "consume-new-record" };
function normalizeRange(range: DateRange): DateRange {
  return range.from <= range.to ? { ...range } : { from: range.to, to: range.from };
}
export function createWalletUIState(input: WalletUIInitial, now: Date): WalletUIState {
  const from = new Date(now);
  from.setDate(now.getDate() - 6);
  return {
    selectedMonth: input.initialMonth ?? monthKey(now),
    selectedPeriodMode: "month",
    customDateRange: normalizeRange(
      input.initialCustomRange ?? { from: dateKey(from), to: dateKey(now) },
    ),
    recordFilters: { type: "all", accountId: input.initialAccountId },
    newRecordRequestId: 0,
    newRecordTemplateId: null,
    reviewReturnContext: null,
  };
}
export function walletUIReducer(state: WalletUIState, action: WalletUIAction): WalletUIState {
  switch (action.type) {
    case "month":
      return { ...state, selectedMonth: action.month, selectedPeriodMode: "month" };
    case "all":
      return { ...state, selectedPeriodMode: "all" };
    case "custom":
      return {
        ...state,
        customDateRange: normalizeRange(action.range),
        selectedPeriodMode: "custom",
      };
    case "filters":
      return {
        ...state,
        recordFilters: { ...state.recordFilters, ...action.filters },
        reviewReturnContext:
          "paymentStatus" in action.filters && action.filters.paymentStatus !== "needs_review"
            ? null
            : state.reviewReturnContext,
      };
    case "clear-filters":
      return { ...state, recordFilters: { type: "all" }, reviewReturnContext: null };
    case "open-review":
      return {
        ...state,
        reviewReturnContext: state.reviewReturnContext ?? {
          recordFilters: { ...state.recordFilters },
          selectedMonth: state.selectedMonth,
          selectedPeriodMode: state.selectedPeriodMode,
          customDateRange: { ...state.customDateRange },
        },
        recordFilters: { type: "all", paymentStatus: "needs_review" },
        selectedPeriodMode: "all",
      };
    case "close-review":
      return state.reviewReturnContext
        ? { ...state, ...state.reviewReturnContext, reviewReturnContext: null }
        : { ...state, recordFilters: { ...state.recordFilters, paymentStatus: "all" } };
    case "new-record":
      return {
        ...state,
        newRecordRequestId: Math.max(action.requestId, state.newRecordRequestId + 1),
        newRecordTemplateId: action.templateId ?? null,
        reviewReturnContext: null,
        recordFilters: { type: "all", accountId: action.accountId },
      };
    case "consume-new-record":
      return { ...state, newRecordRequestId: 0, newRecordTemplateId: null };
  }
}
