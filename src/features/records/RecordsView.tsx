import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Copy, Edit3, FilterX, Plus, Save, Trash2, X } from "lucide-react";
import { findExchangeRate } from "@shared/money";
import {
  countNewReviews,
  getMerchantCorrections,
  isReviewCategory,
  normalizeBankMerchant,
  recordReviewDate,
  splitImportNote,
} from "@shared/record-review";
import {
  calculateAccountBalances,
  formatMoney,
  groupRecordsByDay,
  isCategoryOrDescendant,
  recordsForDateRange,
} from "@shared/calculations";
import { paymentStatusLabels, paymentTypeLabels, recordTypeLabels } from "@shared/constants";

import { useRecordDraft } from "./use-record-draft";

import type { RecordPatch } from "@shared/schemas";
import type {
  CurrencyCode,
  PaymentStatus,
  PaymentType,
  RecordType,
  RecordFilters,
  RecordGoalAssociation,
  WalletRecord,
} from "@shared/types";

import {
  emptyDraft,
  draftFromRecord,
  duplicateDraft,
  draftFromTemplate,
  recordSubmitMode,
  hasInvalidGoalAllocation as draftHasInvalidGoalAllocation,
  scaleDraftAmount,
  buildRecordInput,
  buildRecordPatch,
  defaultRecordAccountId as defaultAccountId,
  defaultRecordDestinationId as defaultDestinationAccountId,
} from "@/lib/record-draft";
import { localDateTimeInput as toDateTimeLocal, dateTimeInputToIso } from "@/lib/date-input";
import { ReviewRecordActions } from "@/components/wallet/review-record-actions";
import { ImportHistory } from "@/components/wallet/record-import-history";
import { CategoryFilterSelect } from "@/components/wallet/category-filter-select";
import { formatCategoryName, sortCategoriesForSelect } from "@/lib/category-options";
import { finishAction } from "@/lib/async-event";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountStateSummary } from "@/components/wallet/account-state-summary";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { CategoryPicker } from "@/components/wallet/category-picker";
import { normalizeGlobalSearch } from "@/lib/global-search";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionToast } from "@/lib/use-action-toast";
import { cn, limitDecimalPlaces } from "@/lib/utils";
import { useWallet } from "@/providers/wallet-provider";

const paymentMethodClasses: Record<PaymentType, string> = {
  cash: "bg-muted text-muted-foreground",
  debit: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  credit: "bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  transfer: "bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  other: "bg-muted text-muted-foreground",
};

const noteFieldClassName =
  "block min-h-24 max-h-64 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring [field-sizing:content]";

function dateTimeLocalToIso(value: string) {
  return value ? dateTimeInputToIso(value) : new Date().toISOString();
}

function typeButtonClassName(item: RecordType, currentType: RecordType) {
  if (item === currentType) {
    if (item === "expense") {
      return "rounded bg-red-500 px-2 py-2 text-sm font-medium text-white shadow-sm";
    }
    if (item === "income") {
      return "rounded bg-emerald-500 px-2 py-2 text-sm font-medium text-white shadow-sm";
    }
    return "rounded bg-sky-500 px-2 py-2 text-sm font-medium text-white shadow-sm";
  }

  if (item === "expense") {
    return "rounded px-2 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/10";
  }
  if (item === "income") {
    return "rounded px-2 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-500/10";
  }
  return "rounded px-2 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-500/10";
}

export function RecordsView() {
  const openedNewRecordRef = useRef(0);
  const {
    dataset,
    selectedMonth,
    selectedPeriodMode,
    selectedDateRange,
    recordFilters,
    setRecordFilters,
    clearRecordFilters,
    isReviewQueueOpen,
    openReviewQueue,
    closeReviewQueue,
    addRecord,
    updateRecord,
    deleteRecord,
    newRecordRequestId,
    newRecordTemplateId,
    consumeNewRecordRequest,
    recordsPage,
    isLoadingMoreRecords,
    isSelectedRangeComplete,
    isAllHistoryComplete,
    loadMoreRecords,
    updateWalletSettings,
  } = useWallet();

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState("");
  const [showNoteFilter, setShowNoteFilter] = useState(false);
  const focusNoteOnOpen = useRef(false);
  const [reviewUndo, setReviewUndo] = useState<{
    before: WalletRecord;
    saved: WalletRecord;
  }>();
  const [reviewWrite, setReviewWrite] = useState<string>();
  const reviewWriteLock = useRef(false);
  const recordDraftRevision = useRef(0);
  const {
    draft,
    setDraft,
    type,
    setType,
    accountId,
    setAccountId,
    creditCardId,
    setCreditCardId,
    currency,
    setCurrency,
    exchangeRateToLimitCurrency,
    setExchangeRateToLimitCurrency,
    destinationAccountId,
    setDestinationAccountId,
    categoryId,
    setCategoryId,
    amount,
    accountAmount,
    setAccountAmount,
    destinationAmount,
    setDestinationAmount,
    primaryRate,
    setPrimaryRate,
    moneyError,
    setMoneyError,
    note,
    setNote,
    goalAssociations,
    setGoalAssociations,
    counterpartyName,
    setCounterpartyName,
    occurredAtLocal,
    setOccurredAtLocal,
    paymentType,
    setPaymentType,
    paymentStatus,
    setPaymentStatus,
  } = useRecordDraft(() => ({
    type: "expense",
    accountId: defaultAccountId(dataset),
    creditCardId: recordFilters.creditCardId ?? "",
    currency: "UYU",
    exchangeRateToLimitCurrency: "1",
    destinationAccountId: defaultDestinationAccountId(dataset, defaultAccountId(dataset)),
    categoryId: "",
    amount: "",
    accountAmount: "",
    destinationAmount: "",
    primaryRate: "",
    moneyError: "",
    note: "",
    tagId: "",
    goalAssociations: [],
    counterpartyName: "",
    occurredAtLocal: toDateTimeLocal(new Date()),
    paymentType: "debit",
    paymentStatus: "cleared",
  }));

  const conversionBasis = useRef<{
    source?: { amount: string; converted: string };
    destination?: { amount: string; converted: string };
  }>({});

  const recordSubmission = useRef(false);

  const { toast, runAction } = useActionToast();
  const reviewCount = dataset.records.filter(
    (record) => record.paymentStatus === "needs_review",
  ).length;
  const newReviewCount = countNewReviews(dataset);
  const reviewSeenThrough = Date.parse(dataset.settings.reviewSeenThrough ?? "") || 0;
  const merchantCorrections = useMemo(() => getMerchantCorrections(dataset), [dataset]);
  const categories = useMemo(
    () => sortCategoriesForSelect(dataset.categories),
    [dataset.categories],
  );
  const reviewCategories = useMemo(
    () => categories.filter((category) => isReviewCategory(category)),
    [categories],
  );
  const selectedAccountBalance = recordFilters.accountId
    ? calculateAccountBalances(dataset).find(
        (balance) => balance.account.id === recordFilters.accountId,
      )
    : undefined;
  const fieldClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const numericAmount = Number(amount);
  const hasInvalidGoalAllocation = draftHasInvalidGoalAllocation(draft);
  const editingLinkedRefund = dataset.creditCardRecords.find(
    (record) => record.walletRecordId === editingId && record.kind === "refund",
  );
  const editingRecord = dataset.records.find((record) => record.id === editingId);
  const submitMode = recordSubmitMode(draft, editingRecord, Boolean(editingLinkedRefund));
  const statusOnlyCancellation = submitMode === "cancel";
  const reviewMetadataOnly = submitMode === "review";
  const canSubmit =
    statusOnlyCancellation ||
    (reviewMetadataOnly && !hasInvalidGoalAllocation) ||
    (numericAmount > 0 &&
      Boolean(accountId || (type === "expense" && creditCardId)) &&
      (type === "transfer" ? Boolean(destinationAccountId) : Boolean(categoryId)) &&
      !hasInvalidGoalAllocation);
  function updateGoalAssociation(goalId: string, patch: Partial<RecordGoalAssociation>) {
    setGoalAssociations((current) =>
      current.map((association) =>
        association.goalId === goalId ? { ...association, ...patch } : association,
      ),
    );
  }
  useEffect(() => {
    if (!newRecordRequestId || openedNewRecordRef.current === newRecordRequestId) return;
    queueMicrotask(() => {
      recordDraftRevision.current += 1;
      openedNewRecordRef.current = newRecordRequestId;
      const now = new Date();
      const requested = dataset.creditCards.find(
        (card) => card.id === recordFilters.creditCardId && card.isActive,
      );
      let next = emptyDraft(dataset, now);
      if (requested)
        next = {
          ...next,
          creditCardId: requested.id,
          currency: requested.limitCurrency,
          paymentType: "credit",
        };
      next = { ...next, goalAssociations: [] };
      let notice = "";
      if (newRecordTemplateId) {
        const template = dataset.recordTemplates?.find((item) => item.id === newRecordTemplateId);
        if (template) {
          const prepared = draftFromTemplate(template, dataset, now, next);
          next = prepared.draft;
          notice = prepared.notice;
        } else notice = "The template is no longer available. Complete a new record.";
      }
      setEditingId(null);
      setTemplateNotice(notice);
      setDraft(next);
      conversionBasis.current = {};
      setIsRecordDialogOpen(true);
      consumeNewRecordRequest();
    });
  }, [
    consumeNewRecordRequest,
    dataset,
    newRecordRequestId,
    newRecordTemplateId,
    recordFilters.creditCardId,
    setDraft,
  ]);

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

  const grouped = groupRecordsByDay(filteredRecords);
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

  function resetForm(nextType: RecordType = "expense") {
    recordDraftRevision.current += 1;
    conversionBasis.current = {};
    setTemplateNotice("");
    setEditingId(null);
    setDraft(emptyDraft(dataset, new Date(), nextType));
  }

  function openNewRecordDialog() {
    resetForm();
    setIsRecordDialogOpen(true);
  }

  function loadRecord(record: WalletRecord) {
    recordDraftRevision.current += 1;
    setTemplateNotice("");
    setEditingId(record.id);
    setDraft(draftFromRecord(record));
    conversionBasis.current = {
      source:
        record.accountAmount === undefined
          ? undefined
          : { amount: String(record.amount), converted: String(record.accountAmount) },
      destination:
        record.destinationAmount === undefined
          ? undefined
          : { amount: String(record.amount), converted: String(record.destinationAmount) },
    };
    setIsRecordDialogOpen(true);
  }

  function duplicateEditingRecord() {
    const record = dataset.records.find((item) => item.id === editingId);
    if (!record) return;
    resetForm(record.type);
    setDraft(duplicateDraft(record, dataset, new Date()));
  }

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

  function closeRecordDialog() {
    setIsRecordDialogOpen(false);
    openedNewRecordRef.current = 0;
    resetForm(type);
  }

  function changeCurrency(next: CurrencyCode) {
    if (next === currency) return;
    setCurrency(next);
    conversionBasis.current = {};
    setPrimaryRate("");
    setAccountAmount("");
    setDestinationAmount("");
    const card = dataset.creditCards.find((item) => item.id === creditCardId);
    setExchangeRateToLimitCurrency(
      card ? String(findExchangeRate(dataset.exchangeRates, next, card.limitCurrency) ?? "") : "1",
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (recordSubmission.current) return;
    if (creditCardId && type !== "expense" && !editingLinkedRefund && !statusOnlyCancellation) {
      setMoneyError(
        "Use Cards to refund a purchase. Income and transfers cannot select a credit card.",
      );
      return;
    }
    const now = new Date();
    const patch = editingId
      ? buildRecordPatch(draft, editingRecord, dataset, now, {
          linkedRefund: Boolean(editingLinkedRefund),
        })
      : null;
    const created = editingId ? null : buildRecordInput(draft, dataset, undefined, now);
    const result = patch ?? created;
    if (!result || !result.ok) {
      if (result?.error) setMoneyError(result.error);
      return;
    }
    recordSubmission.current = true;
    const revision = recordDraftRevision.current;
    try {
      if (editingId && patch?.ok)
        await runAction(() => updateRecord(editingId, patch.patch), {
          processing: "Saving record...",
          success: "Record saved",
          error: "Could not save record",
        });
      else if (created?.ok)
        await runAction(() => addRecord(created.value), {
          processing: "Creating record...",
          success: "Record created",
          error: "Could not create record",
        });
    } catch {
      return;
    } finally {
      recordSubmission.current = false;
    }
    if (revision === recordDraftRevision.current) closeRecordDialog();
  }

  async function handleDeleteEditingRecord() {
    if (!editingId) return;
    try {
      await runAction(() => deleteRecord(editingId), {
        processing: "Deleting record...",
        success: "Record deleted",
        error: "Could not delete record",
      });
    } catch {
      return;
    }

    closeRecordDialog();
  }

  function updateSearch(value: string) {
    setRecordFilters({ search: value });
  }

  return (
    <div>
      <ActionToast toast={toast} />
      <PageHeader
        eyebrow="Records"
        title="Records"
        description="Open any record to edit amount, account, counterparty, status, or notes."
      >
        <Button
          variant="outline"
          onClick={toggleReviewQueue}
          aria-label="Open review queue"
          aria-pressed={isReviewQueueOpen}
        >
          Needs review {isAllHistoryComplete ? `(${reviewCount})` : "· Loading…"}
          {isAllHistoryComplete && newReviewCount > 0 && (
            <Badge variant="warning">{newReviewCount} new</Badge>
          )}
        </Button>
        <Button onClick={openNewRecordDialog}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </PageHeader>

      {selectedPeriodMode === "all" && isReviewQueueOpen && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground" role="status">
            Review queue · All dates
            {isAllHistoryComplete &&
              ` · ${newReviewCount} new · ${reviewCount - newReviewCount} seen, still pending`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!isAllHistoryComplete || !newReviewCount}
            onClick={markReviewQueueSeen}
          >
            Mark queue as seen
          </Button>
        </div>
      )}
      {reviewUndo?.saved?.updatedAt && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          <span role="status">
            Saved review for{" "}
            {reviewUndo.before.importMerchant ?? reviewUndo.before.counterpartyName ?? "record"}.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(reviewWrite)}
            onClick={() => void undoReview()}
          >
            Undo
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss undo"
            onClick={() => setReviewUndo(undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {merchantCorrections.size > 0 && (
        <details className="mb-4 rounded-md border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">Merchant category rules</summary>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {[...merchantCorrections.values()].map(({ record, category }) => (
              <label
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {record.importMerchant} · {formatCategoryName(categories, category)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={record.merchantCorrection?.autoApply ?? false}
                    disabled={Boolean(reviewWrite)}
                    onChange={(event) =>
                      void saveReview(record, {
                        merchantAutoApply: event.target.checked,
                      })
                    }
                  />
                  Apply automatically
                </span>
              </label>
            ))}
          </div>
        </details>
      )}

      {selectedAccountBalance ? <AccountStateSummary balance={selectedAccountBalance} /> : null}

      <Dialog
        open={isRecordDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeRecordDialog();
          else setIsRecordDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Edit record" : "New record"}
            </DialogTitle>
            <DialogDescription>
              Adjust type, amount, account, category, goals, and payment status.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              finishAction(handleSubmit(event));
            }}
          >
            {statusOnlyCancellation && (
              <p role="status" className="text-sm text-muted-foreground">
                Cancelling preserves the original record and excludes it from balances.
              </p>
            )}
            {templateNotice && (
              <p role="status" className="text-sm text-muted-foreground">
                {templateNotice}
              </p>
            )}
            {editingLinkedRefund && (
              <p className="text-sm text-muted-foreground">
                Bank-linked card refund amounts and payment details are managed in Cards. You can
                edit its category, counterparty, goals, tags and note here.
              </p>
            )}
            {moneyError && (
              <p role="alert" className="text-sm text-red-500">
                {moneyError}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary p-1">
              {(["expense", "income", "transfer"] as RecordType[]).map((item) => (
                <button
                  key={item}
                  disabled={Boolean(editingLinkedRefund)}
                  type="button"
                  onClick={() => {
                    setType(item);
                    setCategoryId("");
                    setPaymentType(item === "transfer" ? "transfer" : "debit");
                    setCreditCardId("");
                    if (item === "transfer") setGoalAssociations([]);
                    if (!accountId) setAccountId(defaultAccountId(dataset));
                  }}
                  className={typeButtonClassName(item, type)}
                >
                  {recordTypeLabels[item]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Amount</span>
                <input
                  disabled={Boolean(editingLinkedRefund)}
                  value={amount}
                  onChange={(event) => {
                    const next = limitDecimalPlaces(event.target.value);
                    const basis = { ...conversionBasis.current };
                    setDraft((current) => scaleDraftAmount(current, next, basis));
                  }}
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                />
              </label>
              <div className="space-y-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Currency</span>
                  <select
                    disabled={Boolean(editingLinkedRefund)}
                    value={currency}
                    onChange={(event) => changeCurrency(event.target.value as CurrencyCode)}
                    className={fieldClassName}
                  >
                    {["UYU", "USD", "EUR", "BRL", "ARS"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <details className="rounded-md border bg-background p-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Exchange rate (optional)
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Uses the default rate unless you enter a custom rate.
                  </p>
                  <div className="mt-3 grid gap-3">
                    {
                      <label className="space-y-1 text-sm">
                        Exchange rate to {dataset.settings.primaryCurrency}
                        <input
                          disabled={Boolean(editingLinkedRefund)}
                          value={primaryRate}
                          onChange={(event) => setPrimaryRate(event.target.value)}
                          placeholder={String(
                            findExchangeRate(
                              dataset.exchangeRates,
                              currency,
                              dataset.settings.primaryCurrency,
                              dateTimeLocalToIso(occurredAtLocal),
                            ) ?? "Enter exchange rate",
                          )}
                          className={fieldClassName}
                          inputMode="decimal"
                        />
                      </label>
                    }
                    {accountId &&
                      dataset.accounts.find((item) => item.id === accountId)?.currency !==
                        currency && (
                        <label className="space-y-1 text-sm">
                          Account amount (
                          {dataset.accounts.find((item) => item.id === accountId)?.currency}
                          )
                          <input
                            disabled={Boolean(editingLinkedRefund)}
                            value={accountAmount}
                            onChange={(event) => {
                              const next = limitDecimalPlaces(event.target.value);
                              setAccountAmount(next);
                              conversionBasis.current.source =
                                Number(amount) > 0 && Number(next) > 0
                                  ? { amount, converted: next }
                                  : undefined;
                            }}
                            className={fieldClassName}
                            inputMode="decimal"
                            placeholder="Calculated using the historical rate"
                          />
                        </label>
                      )}
                    {type === "transfer" && (
                      <label className="space-y-1 text-sm">
                        Received amount (
                        {
                          dataset.accounts.find((item) => item.id === destinationAccountId)
                            ?.currency
                        }
                        )
                        <input
                          disabled={Boolean(editingLinkedRefund)}
                          value={destinationAmount}
                          onChange={(event) => {
                            const next = limitDecimalPlaces(event.target.value);
                            setDestinationAmount(next);
                            conversionBasis.current.destination =
                              Number(amount) > 0 && Number(next) > 0
                                ? { amount, converted: next }
                                : undefined;
                          }}
                          className={fieldClassName}
                          inputMode="decimal"
                          placeholder="Calculated using the historical rate"
                        />
                      </label>
                    )}
                    {creditCardId && (
                      <label className="space-y-1 text-sm">
                        Exchange rate to card limit currency
                        <input
                          disabled={Boolean(editingLinkedRefund)}
                          value={exchangeRateToLimitCurrency}
                          onChange={(event) => setExchangeRateToLimitCurrency(event.target.value)}
                          className={fieldClassName}
                          inputMode="decimal"
                        />
                      </label>
                    )}
                  </div>
                </details>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  {type === "expense" && creditCardId
                    ? "Account (optional for card purchases)"
                    : "Account"}
                </span>
                <select
                  disabled={Boolean(editingLinkedRefund)}
                  value={accountId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setAccountId(nextId);
                    setAccountAmount("");
                    conversionBasis.current.source = undefined;
                    if (!editingId && !creditCardId) {
                      const next = dataset.accounts.find((item) => item.id === nextId);
                      if (next) changeCurrency(next.currency);
                      setPrimaryRate("");
                    }
                  }}
                  className={fieldClassName}
                >
                  {!(
                    type === "expense" &&
                    creditCardId &&
                    dataset.records.find((record) => record.id === editingId)?.accountId
                  ) && (
                    <option value="">
                      {type === "expense" && creditCardId ? "Card only" : "Choose account"}
                    </option>
                  )}
                  {dataset.accounts
                    .filter((account) => account.isActive && account.isVisible)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
              {type === "transfer" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Destination account</span>
                  <select
                    disabled={Boolean(editingLinkedRefund)}
                    value={destinationAccountId}
                    onChange={(event) => {
                      setDestinationAccountId(event.target.value);
                      setDestinationAmount("");
                      conversionBasis.current.destination = undefined;
                    }}
                    className={fieldClassName}
                  >
                    <option value="">Choose destination account</option>
                    {dataset.accounts
                      .filter(
                        (account) =>
                          account.isActive && account.isVisible && account.id !== accountId,
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Category</span>
                  <CategoryPicker
                    categories={categories}
                    value={categoryId}
                    onChange={setCategoryId}
                    inputClassName={fieldClassName}
                    getLabel={(category) => formatCategoryName(dataset.categories, category)}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Date and time</span>
                  <input
                    disabled={Boolean(editingLinkedRefund)}
                    value={occurredAtLocal}
                    onChange={(event) => setOccurredAtLocal(event.target.value)}
                    className={fieldClassName}
                    type="datetime-local"
                  />
                </label>
              }
              <label className="block space-y-2">
                <span className="text-sm font-medium">Counterparty</span>
                <input
                  value={counterpartyName}
                  onChange={(event) => setCounterpartyName(event.target.value)}
                  className={fieldClassName}
                  placeholder="Name"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Payment type</span>
                <select
                  disabled={Boolean(editingLinkedRefund)}
                  value={creditCardId ? `card:${creditCardId}` : paymentType}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith("card:")) {
                      const nextCardId = value.slice(5);
                      const card = dataset.creditCards.find((item) => item.id === nextCardId);
                      setCreditCardId(nextCardId);
                      setPaymentType("credit");
                      changeCurrency(card?.limitCurrency ?? "UYU");
                      setExchangeRateToLimitCurrency("1");
                      return;
                    }
                    setCreditCardId("");
                    setPaymentType(value as PaymentType);
                    const nextAccountId = accountId || defaultAccountId(dataset);
                    setAccountId(nextAccountId);
                    const account = dataset.accounts.find((item) => item.id === nextAccountId);
                    if (account) changeCurrency(account.currency);
                  }}
                  className={fieldClassName}
                >
                  <option value="cash">{paymentTypeLabels.cash}</option>
                  <option value="debit">{paymentTypeLabels.debit}</option>
                  {dataset.creditCards
                    .filter(
                      (card) =>
                        (type === "expense" && card.isActive) ||
                        (editingLinkedRefund && card.id === creditCardId),
                    )
                    .map((card) => (
                      <option key={card.id} value={`card:${card.id}`}>
                        Credit **** {card.lastFour} - {card.name}
                      </option>
                    ))}
                  <option value="transfer">{paymentTypeLabels.transfer}</option>
                  <option value="other">{paymentTypeLabels.other}</option>
                </select>
              </label>
              {type !== "transfer" ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Goals</span>
                  <div className="flex min-h-10 flex-wrap gap-2 rounded-md border bg-background p-2">
                    {dataset.goals
                      .filter(
                        (goal) =>
                          goal.status === "active" ||
                          goalAssociations.some((association) => association.goalId === goal.id),
                      )
                      .map((goal) => {
                        const association = goalAssociations.find(
                          (item) => item.goalId === goal.id,
                        );

                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() =>
                              setGoalAssociations((current) =>
                                association
                                  ? current.filter((item) => item.goalId !== goal.id)
                                  : [
                                      ...current,
                                      {
                                        goalId: goal.id,
                                        assignmentSource: "manual",
                                        useReserved: !editingId,
                                        reserveIncome: true,
                                      },
                                    ],
                              )
                            }
                            className={
                              association
                                ? "rounded-md border px-2 py-1 text-xs font-medium text-white"
                                : "rounded-md border px-2 py-1 text-xs text-muted-foreground"
                            }
                            style={
                              association
                                ? {
                                    backgroundColor: goal.color,
                                    borderColor: goal.color,
                                  }
                                : undefined
                            }
                          >
                            {goal.name}
                            {association?.assignmentSource === "date_rule" ? " · automatic" : ""}
                          </button>
                        );
                      })}
                    {dataset.goals.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No active goals</span>
                    ) : null}
                  </div>
                  {goalAssociations.map((association) => {
                    const goal = dataset.goals.find((item) => item.id === association.goalId);
                    if (!goal) return null;
                    const key = type === "income" ? "reserveIncome" : "useReserved";

                    return (
                      <div key={goal.id} className="space-y-2 rounded-md border p-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={association[key]}
                            onChange={(event) =>
                              updateGoalAssociation(goal.id, {
                                [key]: event.target.checked,
                              })
                            }
                          />
                          {type === "income" ? "Reserve this income again" : "Use reserved funds"} ·{" "}
                          {goal.name}
                        </label>
                        <label className="block space-y-1 text-xs text-muted-foreground">
                          <span>Amount for this goal</span>
                          <input
                            value={association.allocatedAmount ?? ""}
                            onChange={(event) => {
                              const value = limitDecimalPlaces(event.target.value);
                              updateGoalAssociation(goal.id, {
                                allocatedAmount: value ? Number(value) : undefined,
                              });
                            }}
                            className={fieldClassName}
                            type="number"
                            min="0"
                            max={amount || undefined}
                            step="0.01"
                            placeholder={
                              amount
                                ? `Entire record (${formatMoney(numericAmount, currency)})`
                                : "Entire record"
                            }
                          />
                          {association.allocatedAmount !== undefined &&
                          association.allocatedAmount > numericAmount ? (
                            <span className="text-red-600">Cannot exceed the record amount.</span>
                          ) : null}
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div />
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Status</legend>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-secondary p-1 sm:grid-cols-4">
                {(["cleared", "pending", "needs_review", "cancelled"] as PaymentStatus[]).map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      aria-label={`Set status to ${paymentStatusLabels[item]}`}
                      aria-pressed={paymentStatus === item}
                      disabled={Boolean(editingLinkedRefund)}
                      onClick={() => setPaymentStatus(item)}
                      className={
                        paymentStatus === item
                          ? "rounded-md bg-background px-2 py-2 text-sm font-medium shadow-sm"
                          : "rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-background/60"
                      }
                    >
                      {paymentStatusLabels[item]}
                    </button>
                  ),
                )}
              </div>
            </fieldset>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Notes</span>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={noteFieldClassName}
                placeholder="Optional description"
              />
            </label>
            {editingRecord && <ImportHistory record={editingRecord} />}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {editingId ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(editingLinkedRefund)}
                    onClick={() => {
                      finishAction(handleDeleteEditingRecord());
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Duplicate record"
                    onClick={duplicateEditingRecord}
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={closeRecordDialog}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!canSubmit}>
                {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? "Save changes" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit min-w-0">
          <CardHeader className="pb-3">
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <input
              value={recordFilters.search ?? ""}
              onChange={(event) => updateSearch(event.target.value)}
              className={fieldClassName}
              placeholder="Search..."
            />
            <select
              value={recordFilters.type ?? "all"}
              onChange={(event) =>
                setRecordFilters({
                  type: event.target.value as "all" | RecordType,
                })
              }
              className={fieldClassName}
            >
              <option value="all">All</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
              <option value="transfer">Transfers</option>
            </select>
            <select
              value={recordFilters.paymentStatus ?? "all"}
              onChange={(event) => {
                if (isReviewQueueOpen && event.target.value === "all") closeReviewQueue();
                else
                  setRecordFilters({
                    paymentStatus: event.target.value as PaymentStatus | "all",
                  });
              }}
              className={fieldClassName}
            >
              <option value="all">All statuses</option>
              <option value="needs_review">Needs review</option>
              <option value="cleared">Cleared</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={recordFilters.accountId ?? ""}
              onChange={(event) => setRecordFilters({ accountId: event.target.value || undefined })}
              className={fieldClassName}
            >
              <option value="">Accounts</option>
              {dataset.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <select
              value={recordFilters.creditCardId ?? ""}
              onChange={(event) =>
                setRecordFilters({
                  creditCardId: event.target.value || undefined,
                  accountId: event.target.value ? undefined : recordFilters.accountId,
                })
              }
              className={fieldClassName}
            >
              <option value="">Cards</option>
              {dataset.creditCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} **** {card.lastFour}
                </option>
              ))}
            </select>
            <CategoryFilterSelect
              categories={categories}
              value={recordFilters.categoryId}
              onChange={(categoryId) => setRecordFilters({ categoryId })}
            />
            {showNoteFilter || recordFilters.note ? (
              <label className="block space-y-1 text-sm">
                <span>Note contains</span>
                <textarea
                  ref={(element) => {
                    if (element && focusNoteOnOpen.current) {
                      element.focus();
                      focusNoteOnOpen.current = false;
                    }
                  }}
                  rows={4}
                  value={recordFilters.note ?? ""}
                  onChange={(event) => setRecordFilters({ note: event.target.value })}
                  className={noteFieldClassName}
                  placeholder="Paste part of a note"
                />
              </label>
            ) : (
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  focusNoteOnOpen.current = true;
                  setShowNoteFilter(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add filter · Note
              </Button>
            )}
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                clearRecordFilters();
                setShowNoteFilter(false);
              }}
            >
              <FilterX className="h-4 w-4" />
              Reset
            </Button>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                {!isSelectedRangeComplete ? (
                  <Badge variant="warning">Loading complete range...</Badge>
                ) : null}
                <Badge variant="muted">
                  {selectedPeriodMode === "all"
                    ? "All history"
                    : selectedPeriodMode === "custom"
                      ? `${format(parseISO(selectedDateRange.from), "dd/MM/yyyy")} - ${format(parseISO(selectedDateRange.to), "dd/MM/yyyy")}`
                      : selectedMonth}
                </Badge>
              </div>
            </div>
            {appliedFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
                {appliedFilters.map(([key, label, value]) => (
                  <button
                    key={key}
                    type="button"
                    className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-left text-xs font-medium hover:bg-secondary/70"
                    aria-label={`Remove ${label} filter`}
                    title={value}
                    onClick={() => {
                      if (key === "paymentStatus" && isReviewQueueOpen) closeReviewQueue();
                      else setRecordFilters({ [key]: undefined });
                      if (key === "note") setShowNoteFilter(false);
                    }}
                  >
                    <span className="truncate">
                      {label}: {value}
                    </span>
                    <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearRecordFilters();
                    setShowNoteFilter(false);
                  }}
                >
                  Clear all
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {!filteredRecords.length && (
              <div className="space-y-2 py-4 text-sm text-muted-foreground" role="status">
                <p>
                  {!isSelectedRangeComplete
                    ? "Loading records for this period…"
                    : appliedFilters.length
                      ? "No records match the active filters in this period."
                      : "No records in this period."}
                </p>
                {isSelectedRangeComplete && appliedFilters.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                    {appliedFilters.map(([key, label, value]) => (
                      <li key={key}>
                        <strong>{label}</strong> · {value}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {Object.entries(grouped).map(([day, records]) => (
              <div key={day}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <p className="font-semibold">{format(parseISO(day), "dd/MM/yyyy")}</p>
                  <p className="text-muted-foreground">{records.length} records</p>
                </div>
                <div className="space-y-2">
                  {records.map((record) => {
                    const category = dataset.categories.find(
                      (item) => item.id === record.categoryId,
                    );
                    const account = dataset.accounts.find((item) => item.id === record.accountId);
                    const creditCard = dataset.creditCards.find(
                      (item) => item.id === record.creditCardId,
                    );
                    const tags = record.tagIds
                      .map((id) => dataset.tags.find((tag) => tag.id === id))
                      .filter(Boolean);

                    const review = record.paymentStatus === "needs_review";
                    const parsedNote = splitImportNote(record.note);
                    const correction = record.importMerchant
                      ? merchantCorrections.get(normalizeBankMerchant(record.importMerchant))
                      : undefined;
                    return (
                      <article
                        key={record.id}
                        className={cn(
                          "min-w-0 rounded-md border",
                          review
                            ? "border-amber-400 bg-amber-50 dark:border-amber-400/50 dark:bg-amber-500/15"
                            : "hover:border-primary/50",
                        )}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => loadRecord(record)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              loadRecord(record);
                            }
                          }}
                          className={cn(
                            "flex min-w-0 cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md p-3 transition sm:flex-nowrap",
                            review
                              ? "hover:bg-amber-100 dark:hover:bg-amber-500/20"
                              : "hover:bg-secondary",
                          )}
                        >
                          <div className="min-w-0 [overflow-wrap:anywhere]">
                            <div className="flex flex-wrap items-center gap-2">
                              <CategoryIcon
                                icon={category?.icon}
                                color={category?.color ?? "#0EA5E9"}
                                size="sm"
                              />
                              <p className="font-medium">
                                {category
                                  ? formatCategoryName(dataset.categories, category)
                                  : record.type === "transfer"
                                    ? "Transfer"
                                    : "Uncategorized"}
                              </p>
                              <Badge
                                variant={
                                  record.type === "expense"
                                    ? "danger"
                                    : record.type === "income"
                                      ? "success"
                                      : "info"
                                }
                              >
                                {recordTypeLabels[record.type]}
                              </Badge>
                              <Badge
                                variant={
                                  record.paymentStatus === "needs_review" ? "warning" : "muted"
                                }
                              >
                                {paymentStatusLabels[record.paymentStatus]}
                              </Badge>
                              {review &&
                                Date.parse(recordReviewDate(record)) > reviewSeenThrough && (
                                  <Badge variant="warning">New</Badge>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {[
                                  account?.name,
                                  creditCard && `${creditCard.name} **** ${creditCard.lastFour}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              {record.importMerchant || record.counterpartyName
                                ? ` - ${record.importMerchant ?? record.counterpartyName}`
                                : " - No counterparty"}
                              {parsedNote.note ? ` - ${parsedNote.note}` : " - No note"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {tags.map((tag) =>
                                tag ? (
                                  <Badge key={tag.id} variant="info">
                                    {tag.name}
                                  </Badge>
                                ) : null,
                              )}
                              <Badge
                                variant="muted"
                                className={`font-semibold ${paymentMethodClasses[record.paymentType]}`}
                                style={
                                  record.paymentType === "credit" && creditCard
                                    ? {
                                        color: creditCard.color,
                                        backgroundColor: `color-mix(in srgb, ${creditCard.color} 15%, transparent)`,
                                      }
                                    : undefined
                                }
                              >
                                {paymentTypeLabels[record.paymentType]}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <div className="text-right">
                              <p
                                className={
                                  record.type === "expense"
                                    ? "font-semibold text-red-600"
                                    : record.type === "income"
                                      ? "font-semibold text-emerald-600"
                                      : "font-semibold text-sky-600"
                                }
                              >
                                {record.type === "expense"
                                  ? "-"
                                  : record.type === "income"
                                    ? "+"
                                    : ""}
                                {formatMoney(record.amount, record.currency)}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                                {formatRecordDateTime(record.occurredAt)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                void runAction(() => deleteRecord(record.id), {
                                  processing: "Deleting record...",
                                  success: "Record deleted",
                                  error: "Could not delete record",
                                }).catch(() => undefined);
                              }}
                              aria-label="Delete record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {review && (
                          <ReviewRecordActions
                            key={`${record.id}:${record.updatedAt ?? record.categoryId}`}
                            record={record}
                            dataset={dataset}
                            categories={reviewCategories}
                            suggestion={correction?.category}
                            autoApply={Boolean(
                              correction?.record.merchantCorrection?.autoApply &&
                              correction.category.id === record.categoryId,
                            )}
                            busy={Boolean(reviewWrite)}
                            onSave={(patch) => void saveReview(record, patch)}
                          />
                        )}
                        {Boolean(record.importHistory?.length || parsedNote.history.length) && (
                          <div className="px-3 pb-3">
                            <ImportHistory record={record} />
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
            {recordsPage.hasMore ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  disabled={isLoadingMoreRecords}
                  onClick={() => void loadMoreRecords()}
                >
                  {isLoadingMoreRecords ? "Loading records..." : "Load older records"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatRecordDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
