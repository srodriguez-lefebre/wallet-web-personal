import {
  calculateAccountBalances,
  groupRecordsByDay,
  isCategoryOrDescendant,
  recordsForDateRange,
} from "@shared/calculations";
import { paymentStatusLabels, recordTypeLabels } from "@shared/constants";
import {
  countNewReviews,
  getMerchantCorrections,
  isReviewCategory,
  recordReviewDate,
} from "@shared/record-review";
import { useMemo, useRef, useState } from "react";

import { useRecordForm } from "./use-record-form";

import type { RecordPatch } from "@shared/schemas";
import type { RecordFilters, WalletRecord } from "@shared/types";

import { useWallet } from "@/providers/wallet-provider";
import { normalizeGlobalSearch } from "@/lib/global-search";
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
    isAllHistoryComplete,
    clearRecordFilters,
    isSelectedRangeComplete,
    deleteRecord,
    recordsPage,
    isLoadingMoreRecords,
    loadMoreRecords,
  } = useWallet();
  const [showNoteFilter, setShowNoteFilter] = useState(false);
  const focusNoteOnOpen = useRef(false);
  const [reviewUndo, setReviewUndo] = useState<{
    before: WalletRecord;
    saved: WalletRecord;
  }>();
  const [reviewWrite, setReviewWrite] = useState<string>();
  const reviewWriteLock = useRef(false);
  const reviewCount = dataset.records.filter(
    (record) => record.paymentStatus === "needs_review",
  ).length;
  const newReviewCount = countNewReviews(dataset);
  const reviewSeenThrough = Date.parse(dataset.settings.reviewSeenThrough ?? "") || 0;
  const merchantCorrections = useMemo(() => getMerchantCorrections(dataset), [dataset]);
  const reviewCategories = useMemo(
    () => categories.filter((category) => isReviewCategory(category)),
    [categories],
  );
  const selectedAccountBalance = recordFilters.accountId
    ? calculateAccountBalances(dataset).find(
        (balance) => balance.account.id === recordFilters.accountId,
      )
    : undefined;
  const filteredRecords = useMemo(() => {
    const periodRecords =
      selectedPeriodMode !== "month"
        ? recordsForDateRange(dataset.records, selectedDateRange)
        : dataset.records.filter((record) => record.occurredAt.startsWith(selectedMonth));

    return periodRecords
      .filter((record) =>
        !recordFilters.type || recordFilters.type === "all"
          ? true
          : record.type === recordFilters.type,
      )
      .filter((record) =>
        !recordFilters.paymentStatus || recordFilters.paymentStatus === "all"
          ? true
          : record.paymentStatus === recordFilters.paymentStatus,
      )
      .filter((record) =>
        recordFilters.creditCardId ? record.creditCardId === recordFilters.creditCardId : true,
      )
      .filter((record) =>
        recordFilters.accountId
          ? record.accountId === recordFilters.accountId ||
            record.destinationAccountId === recordFilters.accountId
          : true,
      )
      .filter((record) =>
        recordFilters.categoryId
          ? record.categoryId &&
            isCategoryOrDescendant(dataset.categories, record.categoryId, recordFilters.categoryId)
          : true,
      )
      .filter((record) =>
        recordFilters.tagId ? record.tagIds.includes(recordFilters.tagId) : true,
      )
      .filter((record) =>
        recordFilters.goalId ? (record.goalIds ?? []).includes(recordFilters.goalId) : true,
      )
      .filter((record) =>
        (record.note ?? "").toLowerCase().includes((recordFilters.note ?? "").trim().toLowerCase()),
      )
      .filter((record) => {
        const category = dataset.categories.find((item) => item.id === record.categoryId);
        const tags = record.tagIds
          .map((id) => dataset.tags.find((tag) => tag.id === id)?.name ?? "")
          .join(" ");
        const categoryName = category ? formatCategoryName(dataset.categories, category) : "";
        const haystack = `${categoryName} ${record.counterpartyName ?? ""} ${record.importMerchant ?? ""} ${tags} ${record.note ?? ""}`;
        return normalizeGlobalSearch(haystack).includes(
          normalizeGlobalSearch(recordFilters.search ?? ""),
        );
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [dataset, recordFilters, selectedDateRange, selectedMonth, selectedPeriodMode]);
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
  async function saveReview(record: WalletRecord, patch: RecordPatch) {
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
    const newest = dataset.records
      .filter((record) => record.paymentStatus === "needs_review")
      .reduce((latest, record) => Math.max(latest, Date.parse(recordReviewDate(record)) || 0), 0);
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
    isAllHistoryComplete,
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
    isSelectedRangeComplete,
    selectedDateRange,
    selectedMonth,
    appliedFilters,
    grouped,
    loadRecord,
    reviewSeenThrough,
    runAction,
    deleteRecord,
    reviewCategories,
    recordsPage,
    isLoadingMoreRecords,
    loadMoreRecords,
    focusNoteInput,
    openNoteFilter,
  };
}
