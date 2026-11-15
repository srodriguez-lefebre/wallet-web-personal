import { groupRecordsByDay } from "@shared/calculations";
import { paymentStatusLabels, recordTypeLabels } from "@shared/constants";
import { selectMerchantCorrections, isReviewCategory } from "@shared/record-review";
import { useMemo, useRef, useState } from "react";

import { useRecordForm } from "./use-record-form";

import type { RecordReviewBaseline } from "@shared/reference-contract";
import type { RecordPatch } from "@shared/schemas";
import type { RecordFilters, WalletRecord } from "@shared/types";

import { useWallet } from "@/providers/wallet-provider";
import { useAccounts, useRecords } from "@/hooks/wallet-entities";
import { formatCategoryName } from "@/lib/category-options";
export function useRecordsView() {
  const form = useRecordForm();
  const { loadRecord, openNewRecordDialog, toast, categories, runAction } = form;
  const {
    dataset,
    recordFilters,
    selectedPeriodMode,
    selectedDateRange,
    selectedMonth,
    isReviewQueueOpen,
    closeReviewQueue,
    openReviewQueue,
    updateRecord,
    updateWalletSettings,
    setRecordFilters,
    recordSummary,
    merchantCorrections: correctionBaselines,
    clearRecordFilters,
    deleteRecord,
  } = useWallet();
  const [showNoteFilter, setShowNoteFilter] = useState(false);
  const focusNoteOnOpen = useRef(false);
  const [reviewUndo, setReviewUndo] = useState<{
    before: RecordReviewBaseline;
    saved: WalletRecord;
  }>();
  const [reviewWrite, setReviewWrite] = useState<string>();
  const reviewWriteLock = useRef(false);
  const reviewCount = recordSummary.review;
  const newReviewCount = recordSummary.newReviews;
  const reviewSeenThrough = Date.parse(dataset.settings.reviewSeenThrough ?? "") || 0;
  const merchantCorrections = useMemo(
    () => selectMerchantCorrections(correctionBaselines, dataset.categories),
    [correctionBaselines, dataset.categories],
  );
  const reviewCategories = useMemo(
    () => categories.filter((category) => isReviewCategory(category)),
    [categories],
  );
  const accounts = useAccounts(Boolean(recordFilters.accountId));
  const selectedAccountBalance = recordFilters.accountId
    ? accounts.balances.find((balance) => balance.account.id === recordFilters.accountId)
    : undefined;
  const page = useRecords({
    ...recordFilters,
    ...(selectedPeriodMode === "all" ? {} : selectedDateRange),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    categoryMode: "descendants",
    searchMode: "wallet",
  });
  const filteredRecords = page.records;
  const recordsPage = {
    hasMore: page.hasMore,
    nextCursor: page.query.data?.pages.at(-1)?.nextCursor ?? null,
  };
  const isRecordsPending = page.query.isPending;
  const isRecordsFetching = page.query.isFetching;
  const isRecordsError = page.query.isError;
  const isFetchingNextPage = page.query.isFetchingNextPage;
  const loadMoreRecords = page.loadMore;
  const grouped = useMemo(() => groupRecordsByDay(filteredRecords), [filteredRecords]);
  const filterCategory = categories.find((category) => category.id === recordFilters.categoryId);
  const activeFilters: Array<[keyof RecordFilters, string, string | undefined]> = [
    [
      "type",
      "Type",
      recordFilters.type && recordFilters.type !== "all"
        ? recordTypeLabels[recordFilters.type]
        : undefined,
    ],
    [
      "accountId",
      "Account",
      recordFilters.accountId &&
        (dataset.accounts.find((item) => item.id === recordFilters.accountId)?.name ??
          "Unavailable"),
    ],
    [
      "creditCardId",
      "Card",
      recordFilters.creditCardId &&
        (dataset.creditCards.find((item) => item.id === recordFilters.creditCardId)?.name ??
          "Unavailable"),
    ],
    [
      "categoryId",
      "Category",
      recordFilters.categoryId &&
        (filterCategory ? formatCategoryName(categories, filterCategory) : "Unavailable"),
    ],
    [
      "tagId",
      "Tag",
      recordFilters.tagId &&
        (dataset.tags.find((item) => item.id === recordFilters.tagId)?.name ?? "Unavailable"),
    ],
    [
      "goalId",
      "Goal",
      recordFilters.goalId &&
        (dataset.goals.find((item) => item.id === recordFilters.goalId)?.name ?? "Unavailable"),
    ],
    [
      "paymentStatus",
      "Status",
      recordFilters.paymentStatus && recordFilters.paymentStatus !== "all"
        ? paymentStatusLabels[recordFilters.paymentStatus]
        : undefined,
    ],
    ["search", "Search", recordFilters.search?.trim()],
    ["note", "Note", recordFilters.note?.trim()],
  ];
  const appliedFilters = activeFilters.filter(([, , value]) => Boolean(value));
  function toggleReviewQueue() {
    if (isReviewQueueOpen) {
      closeReviewQueue();
      return;
    }
    openReviewQueue();
  }
  async function saveReview(record: RecordReviewBaseline, patch: RecordPatch) {
    if (reviewWriteLock.current) return;
    reviewWriteLock.current = true;
    setReviewWrite(record.id);
    try {
      await runAction(
        async () => {
          const saved = await updateRecord(record.id, {
            ...patch,
            expectedUpdatedAt: record.updatedAt,
          });
          setReviewUndo({ before: record, saved });
        },
        {
          processing: "Saving review…",
          success: "Review saved",
          error: "Could not save review",
        },
      );
    } catch {
      // The toast reports the failure and the row retains its selection.
    } finally {
      reviewWriteLock.current = false;
      setReviewWrite(undefined);
    }
  }
  async function undoReview() {
    if (!reviewUndo || reviewWriteLock.current) return;
    const { before, saved } = reviewUndo;
    if (!saved?.updatedAt) return;
    reviewWriteLock.current = true;
    setReviewWrite(before.id);
    try {
      await runAction(
        async () => {
          await updateRecord(before.id, {
            categoryId: before.categoryId ?? null,
            paymentStatus: before.paymentStatus,
            expectedUpdatedAt: saved.updatedAt,
            ...(before.importMerchant
              ? { restoreMerchantCorrection: before.merchantCorrection ?? null }
              : {}),
          });
          setReviewUndo(undefined);
        },
        {
          processing: "Undoing review…",
          success: "Review undone",
          error: "Could not undo review",
        },
      );
    } catch {
      // Keep the action visible so the user can see what failed.
    } finally {
      reviewWriteLock.current = false;
      setReviewWrite(undefined);
    }
  }
  function markReviewQueueSeen() {
    const newest = Date.parse(recordSummary.latestReviewAt ?? "") || 0;
    if (newest > 0) {
      void runAction(
        () =>
          updateWalletSettings({
            reviewSeenThrough: new Date(newest).toISOString(),
          }),
        {
          processing: "Marking records as seen…",
          success: "Review queue marked as seen",
          error: "Could not mark records as seen",
        },
      ).catch(() => undefined);
    }
  }
  function updateSearch(value: string) {
    setRecordFilters({ search: value });
  }
  const focusNoteInput = (element: HTMLTextAreaElement | null) => {
    if (element && focusNoteOnOpen.current) {
      element.focus();
      focusNoteOnOpen.current = false;
    }
  };
  const openNoteFilter = () => {
    focusNoteOnOpen.current = true;
    setShowNoteFilter(true);
  };
  return {
    toast,
    toggleReviewQueue,
    isReviewQueueOpen,
    reviewCount,
    newReviewCount,
    openNewRecordDialog,
    selectedPeriodMode,
    markReviewQueueSeen,
    reviewUndo,
    reviewWrite,
    undoReview,
    setReviewUndo,
    merchantCorrections,
    categories,
    saveReview,
    selectedAccountBalance,
    form,
    recordFilters,
    updateSearch,
    setRecordFilters,
    closeReviewQueue,
    dataset,
    showNoteFilter,
    setShowNoteFilter,
    clearRecordFilters,
    filteredRecords,
    recordsPage,
    isFetchingNextPage,
    loadMoreRecords,
    isRecordsPending,
    isRecordsFetching,
    isRecordsError,
    selectedDateRange,
    selectedMonth,
    appliedFilters,
    grouped,
    loadRecord,
    reviewSeenThrough,
    runAction,
    deleteRecord,
    reviewCategories,
    focusNoteInput,
    openNoteFilter,
  };
}
