import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Edit3, FilterX, Plus, Save, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountStateSummary } from "@/components/wallet/account-state-summary";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { CategoryPicker } from "@/components/wallet/category-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionToast } from "@/lib/use-action-toast";
import { limitDecimalPlaces } from "@/lib/utils";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateAccountBalances,
  formatMoney,
  groupRecordsByDay,
  isCategoryOrDescendant,
  recordsForDateRange,
} from "@shared/calculations";
import {
  paymentStatusLabels,
  paymentTypeLabels,
  recordTypeLabels,
} from "@shared/constants";
import type {
  Category,
  CurrencyCode,
  PaymentStatus,
  PaymentType,
  RecordType,
  RecordGoalAssociation,
  WalletDataset,
  WalletRecord,
} from "@shared/types";

function formatCategoryName(categories: Category[], category: Category) {
  const parent = category.parentId
    ? categories.find((candidate) => candidate.id === category.parentId)
    : undefined;

  return parent ? `${parent.name} / ${category.name}` : category.name;
}

function sortCategoriesForSelect(categories: Category[]) {
  return categories.slice().sort((a, b) => {
    const aParent = a.parentId
      ? (categories.find((category) => category.id === a.parentId)?.name ?? "")
      : a.name;
    const bParent = b.parentId
      ? (categories.find((category) => category.id === b.parentId)?.name ?? "")
      : b.name;
    const parentCompare = aParent.localeCompare(bParent);

    if (parentCompare !== 0) return parentCompare;
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return a.name.localeCompare(b.name);
  });
}

function CategoryFilterSelect({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value?: string;
  onChange: (categoryId: string | undefined) => void;
}) {
  const selectedCategory = categories.find((category) => category.id === value);

  return (
    <Select.Root
      value={value ?? "all"}
      onValueChange={(categoryId) =>
        onChange(categoryId === "all" ? undefined : categoryId)
      }
    >
      <Select.Trigger
        className="flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        aria-label="Category"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedCategory ? (
            <CategoryIcon
              icon={selectedCategory.icon}
              color={selectedCategory.color}
              size="sm"
            />
          ) : null}
          <Select.Value placeholder="Categories" />
        </span>
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <Select.Viewport className="p-1">
            <Select.Item
              value="all"
              className="relative flex cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-secondary"
            >
              <Select.ItemText>Categories</Select.ItemText>
              <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                <Check className="h-4 w-4" />
              </Select.ItemIndicator>
            </Select.Item>
            {categories.map((category) => (
              <Select.Item
                key={category.id}
                value={category.id}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-secondary"
              >
                <CategoryIcon icon={category.icon} color={category.color} size="sm" />
                <Select.ItemText>
                  {formatCategoryName(categories, category)}
                </Select.ItemText>
                <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check className="h-4 w-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function defaultAccountId(dataset: WalletDataset) {
  const activeVisibleAccounts = dataset.accounts.filter(
    (account) => account.isActive && account.isVisible,
  );
  return (
    activeVisibleAccounts.find(
      (account) =>
        account.id ===
        (dataset.settings.defaultAccountId ??
          dataset.settings.primaryAccountId),
    )?.id ??
    activeVisibleAccounts[0]?.id ??
    dataset.accounts.find((account) => account.isActive)?.id ??
    ""
  );
}

function defaultDestinationAccountId(
  dataset: WalletDataset,
  sourceAccountId: string,
) {
  return (
    dataset.accounts.find(
      (account) =>
        account.isActive && account.isVisible && account.id !== sourceAccountId,
    )?.id ?? ""
  );
}

function toDateTimeLocal(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
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
    addRecord,
    updateRecord,
    deleteRecord,
    newRecordRequestId,
    consumeNewRecordRequest,
    recordsPage,
    isLoadingMoreRecords,
    isSelectedRangeComplete,
    loadMoreRecords,
  } = useWallet();

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<RecordType>("expense");
  const [accountId, setAccountId] = useState(defaultAccountId(dataset));
  const [creditCardId, setCreditCardId] = useState(
    recordFilters.creditCardId ?? "",
  );
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [exchangeRateToLimitCurrency, setExchangeRateToLimitCurrency] =
    useState("1");
  const [destinationAccountId, setDestinationAccountId] = useState(
    defaultDestinationAccountId(dataset, defaultAccountId(dataset)),
  );
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [accountAmount, setAccountAmount] = useState("");
  const [note, setNote] = useState("");
  const [tagId, setTagId] = useState("");
  const [goalAssociations, setGoalAssociations] = useState<RecordGoalAssociation[]>([]);
  const [counterpartyName, setCounterpartyName] = useState("");
  const [occurredAtLocal, setOccurredAtLocal] = useState(() =>
    toDateTimeLocal(new Date()),
  );
  const [paymentType, setPaymentType] = useState<PaymentType>("debit");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("cleared");
  const { toast, runAction } = useActionToast();
  const categories = useMemo(
    () => sortCategoriesForSelect(dataset.categories),
    [dataset.categories],
  );
  const selectedAccountBalance = recordFilters.accountId
    ? calculateAccountBalances(dataset).find(
        (balance) => balance.account.id === recordFilters.accountId,
      )
    : undefined;
  const fieldClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const numericAmount = Number(amount);
  const hasInvalidGoalAllocation = goalAssociations.some(
    (association) =>
      association.allocatedAmount !== undefined &&
      (!Number.isFinite(association.allocatedAmount) ||
        association.allocatedAmount <= 0 ||
        association.allocatedAmount > numericAmount),
  );
  const canSubmit =
    numericAmount > 0 &&
    Boolean(accountId) &&
    (type === "transfer" ? Boolean(destinationAccountId) : Boolean(categoryId)) &&
    !hasInvalidGoalAllocation;
  function updateGoalAssociation(
    goalId: string,
    patch: Partial<RecordGoalAssociation>,
  ) {
    setGoalAssociations((current) =>
      current.map((association) =>
        association.goalId === goalId
          ? { ...association, ...patch }
          : association,
      ),
    );
  }
  useEffect(() => {
    if (
      !newRecordRequestId ||
      openedNewRecordRef.current === newRecordRequestId
    )
      return;

    queueMicrotask(() => {
      openedNewRecordRef.current = newRecordRequestId;
      const nextAccountId = defaultAccountId(dataset);
      const requestedCard = dataset.creditCards.find(
        (card) => card.id === recordFilters.creditCardId && card.isActive,
      );
      setEditingId(null);
      setType("expense");
      const defaultCard = dataset.creditCards.find(
        (card) =>
          card.id === dataset.settings.defaultCreditCardId && card.isActive,
      );
      const nextCard = requestedCard ?? defaultCard;
      setAccountId(nextAccountId);
      setCreditCardId(nextCard?.id ?? "");
      setCurrency(
        nextCard?.limitCurrency ??
          dataset.accounts.find((account) => account.id === nextAccountId)
            ?.currency ??
          "UYU",
      );
      setExchangeRateToLimitCurrency("1");
      setDestinationAccountId(
        defaultDestinationAccountId(dataset, nextAccountId),
      );
      setCategoryId("");
      setAmount("");
      setAccountAmount("");
      setNote("");
      setTagId("");
      setCounterpartyName("");
      setOccurredAtLocal(toDateTimeLocal(new Date()));
      setPaymentType(nextCard ? "credit" : dataset.settings.defaultPaymentType);
      setPaymentStatus(dataset.settings.defaultPaymentStatus);
      setIsRecordDialogOpen(true);
      consumeNewRecordRequest();
    });
  }, [
    consumeNewRecordRequest,
    dataset,
    newRecordRequestId,
    recordFilters.creditCardId,
  ]);

  const filteredRecords = useMemo(() => {
    const periodRecords =
      selectedPeriodMode !== "month"
        ? recordsForDateRange(dataset.records, selectedDateRange)
        : dataset.records.filter((record) =>
            record.occurredAt.startsWith(selectedMonth),
          );

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
        recordFilters.creditCardId
          ? record.creditCardId === recordFilters.creditCardId
          : true,
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
            isCategoryOrDescendant(
              dataset.categories,
              record.categoryId,
              recordFilters.categoryId,
            )
          : true,
      )
      .filter((record) =>
        recordFilters.tagId
          ? record.tagIds.includes(recordFilters.tagId)
          : true,
      )
      .filter((record) =>
        recordFilters.goalId
          ? (record.goalIds ?? []).includes(recordFilters.goalId)
          : true,
      )
      .filter((record) => {
        const category = dataset.categories.find(
          (item) => item.id === record.categoryId,
        );
        const tags = record.tagIds
          .map((id) => dataset.tags.find((tag) => tag.id === id)?.name ?? "")
          .join(" ");
        const categoryName = category
          ? formatCategoryName(dataset.categories, category)
          : "";
        const haystack = `${categoryName} ${record.counterpartyName ?? ""} ${tags} ${record.note ?? ""}`;
        return haystack
          .toLowerCase()
          .includes((recordFilters.search ?? "").toLowerCase());
      })
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
  }, [
    dataset,
    recordFilters,
    selectedDateRange,
    selectedMonth,
    selectedPeriodMode,
  ]);

  const grouped = groupRecordsByDay(filteredRecords);
  const activeFilters = [
    recordFilters.type && recordFilters.type !== "all"
      ? recordFilters.type
      : null,
    recordFilters.accountId
      ? dataset.accounts.find(
          (account) => account.id === recordFilters.accountId,
        )?.name
      : null,
    recordFilters.creditCardId
      ? dataset.creditCards.find(
          (card) => card.id === recordFilters.creditCardId,
        )?.name
      : null,
    recordFilters.categoryId
      ? (() => {
          const category = dataset.categories.find(
            (candidate) => candidate.id === recordFilters.categoryId,
          );
          return category
            ? formatCategoryName(dataset.categories, category)
            : null;
        })()
      : null,
    recordFilters.tagId
      ? dataset.tags.find((tag) => tag.id === recordFilters.tagId)?.name
      : null,
    recordFilters.goalId
      ? dataset.goals.find((goal) => goal.id === recordFilters.goalId)?.name
      : null,
    recordFilters.paymentStatus && recordFilters.paymentStatus !== "all"
      ? paymentStatusLabels[recordFilters.paymentStatus]
      : null,
    recordFilters.search,
  ].filter(Boolean);

  function resetForm(nextType: RecordType = "expense") {
    const nextAccountId = defaultAccountId(dataset);
    setEditingId(null);
    setType(nextType);
    setAccountId(nextAccountId);
    const defaultCard = dataset.creditCards.find(
      (card) =>
        card.id === dataset.settings.defaultCreditCardId && card.isActive,
    );
    setCreditCardId(nextType === "transfer" ? "" : (defaultCard?.id ?? ""));
    setCurrency(
      dataset.accounts.find((account) => account.id === nextAccountId)
        ?.currency ?? "UYU",
    );
    setExchangeRateToLimitCurrency("1");
    setDestinationAccountId(
      defaultDestinationAccountId(dataset, nextAccountId),
    );
    setCategoryId("");
    setAmount("");
    setAccountAmount("");
    setNote("");
    setTagId("");
    const date = new Date().toISOString().slice(0, 10);
    setGoalAssociations(dataset.goals.filter((goal) =>
      goal.status === "active" && goal.autoCaptureEnabled && goal.autoCaptureStart && goal.autoCaptureEnd && goal.autoCaptureStart <= date && goal.autoCaptureEnd >= date
    ).map((goal) => ({ goalId: goal.id, assignmentSource: "date_rule", useReserved: true, reserveIncome: true })));
    setCounterpartyName("");
    setOccurredAtLocal(toDateTimeLocal(new Date()));
    setPaymentType(
      nextType === "transfer"
        ? "transfer"
        : defaultCard
          ? "credit"
          : dataset.settings.defaultPaymentType,
    );
    setPaymentStatus(dataset.settings.defaultPaymentStatus);
  }

  function openNewRecordDialog() {
    resetForm();
    setIsRecordDialogOpen(true);
  }

  function loadRecord(record: WalletRecord) {
    setEditingId(record.id);
    setType(record.type);
    setAccountId(record.accountId ?? "");
    setCreditCardId(record.creditCardId ?? "");
    setCurrency(record.currency);
    setExchangeRateToLimitCurrency(
      String(record.exchangeRateToLimitCurrency ?? 1),
    );
    setDestinationAccountId(record.destinationAccountId ?? "");
    setCategoryId(record.categoryId ?? "");
    setAmount(String(record.amount));
    setAccountAmount(String(record.accountAmount ?? record.amount));
    setNote(record.note ?? "");
    setTagId(record.tagIds[0] ?? "");
    setGoalAssociations(record.goalAssociations ?? (record.goalIds ?? []).map((goalId) => ({ goalId, assignmentSource: "manual", useReserved: true, reserveIncome: true })));
    setCounterpartyName(record.counterpartyName ?? "");
    setOccurredAtLocal(toDateTimeLocal(record.occurredAt));
    setPaymentType(record.paymentType);
    setPaymentStatus(record.paymentStatus);
    setIsRecordDialogOpen(true);
  }

  function closeRecordDialog() {
    setIsRecordDialogOpen(false);
    openedNewRecordRef.current = 0;
    resetForm(type);
  }

  function buildRecord(): Omit<WalletRecord, "id"> | null {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return null;
    if (hasInvalidGoalAllocation) return null;

    const account = dataset.accounts.find((item) => item.id === accountId);
    const card = dataset.creditCards.find((item) => item.id === creditCardId);
    const limitRate = Number(exchangeRateToLimitCurrency) || 1;

    return {
      type,
      amount: numericAmount,
      currency: creditCardId
        ? currency
        : ((account?.currency ?? currency) as CurrencyCode),
      accountId,
      accountAmount: creditCardId
        ? Number(accountAmount) || numericAmount * limitRate
        : undefined,
      creditCardId: creditCardId || undefined,
      destinationAccountId:
        type === "transfer" ? destinationAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      counterpartyName: counterpartyName.trim() || undefined,
      tagIds: tagId ? [tagId] : [],
      goalIds: goalAssociations.map((association) => association.goalId),
      goalAssociations,
      paymentType,
      paymentStatus,
      exchangeRateToPrimary: account?.currency === "USD" ? 39.2 : 1,
      amountInLimitCurrency: card ? numericAmount * limitRate : undefined,
      exchangeRateToLimitCurrency: card ? limitRate : undefined,
      occurredAt: dateTimeLocalToIso(occurredAtLocal),
      note: note || undefined,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextRecord = buildRecord();
    if (!nextRecord) return;

    try {
      if (editingId) {
        await runAction(() => updateRecord(editingId, nextRecord), {
          processing: "Saving record...",
          success: "Record saved",
          error: "Could not save record",
        });
      } else {
        await runAction(() => addRecord(nextRecord), {
          processing: "Creating record...",
          success: "Record created",
          error: "Could not create record",
        });
      }
    } catch {
      return;
    }

    closeRecordDialog();
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
        <Button onClick={openNewRecordDialog}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </PageHeader>

      {selectedAccountBalance ? (
        <AccountStateSummary balance={selectedAccountBalance} />
      ) : null}

      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? (
                <Edit3 className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingId ? "Edit record" : "New record"}
            </DialogTitle>
            <DialogDescription>
              Adjust type, amount, account, category, goals, and payment status.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary p-1">
              {(["expense", "income", "transfer"] as RecordType[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setType(item);
                      setCategoryId("");
                      setPaymentType(
                        item === "transfer" ? "transfer" : "debit",
                      );
                      setCreditCardId("");
                      if (item === "transfer") setGoalAssociations([]);
                      if (!accountId) setAccountId(defaultAccountId(dataset));
                    }}
                    className={typeButtonClassName(item, type)}
                  >
                    {recordTypeLabels[item]}
                  </button>
                ),
              )}
            </div>


            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Amount</span>
                <input
                  value={amount}
                  onChange={(event) =>
                    setAmount(limitDecimalPlaces(event.target.value))
                  }
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Date and time</span>
                <input
                  value={occurredAtLocal}
                  onChange={(event) => setOccurredAtLocal(event.target.value)}
                  className={fieldClassName}
                  type="datetime-local"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Account</span>
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className={fieldClassName}
                >
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
                  <span className="text-sm font-medium">
                    Destination account
                  </span>
                  <select
                    value={destinationAccountId}
                    onChange={(event) =>
                      setDestinationAccountId(event.target.value)
                    }
                    className={fieldClassName}
                  >
                    {dataset.accounts
                      .filter(
                        (account) =>
                          account.isActive &&
                          account.isVisible &&
                          account.id !== accountId,
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
                    getLabel={(category) =>
                      formatCategoryName(dataset.categories, category)
                    }
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {type !== "transfer" ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Goals</span>
                  <div className="flex min-h-10 flex-wrap gap-2 rounded-md border bg-background p-2">
                    {dataset.goals
                      .filter(
                        (goal) =>
                          goal.status === "active" ||
                          goalAssociations.some(
                            (association) => association.goalId === goal.id,
                          ),
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
                                  ? current.filter(
                                      (item) => item.goalId !== goal.id,
                                    )
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
                            {association?.assignmentSource === "date_rule"
                              ? " · automático"
                              : ""}
                          </button>
                        );
                      })}
                    {dataset.goals.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No active goals
                      </span>
                    ) : null}
                  </div>
                  {goalAssociations.map((association) => {
                    const goal = dataset.goals.find(
                      (item) => item.id === association.goalId,
                    );
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
                          {type === "income"
                            ? "Volver a reservar este ingreso"
                            : "Usar fondos reservados"}{" "}
                          · {goal.name}
                        </label>
                        <label className="block space-y-1 text-xs text-muted-foreground">
                          <span>Monto para este objetivo</span>
                          <input
                            value={association.allocatedAmount ?? ""}
                            onChange={(event) => {
                              const value = limitDecimalPlaces(
                                event.target.value,
                              );
                              updateGoalAssociation(goal.id, {
                                allocatedAmount: value
                                  ? Number(value)
                                  : undefined,
                              });
                            }}
                            className={fieldClassName}
                            type="number"
                            min="0"
                            max={amount || undefined}
                            step="0.01"
                            placeholder={
                              amount
                                ? `Todo el record (${formatMoney(
                                    numericAmount,
                                    currency,
                                  )})`
                                : "Todo el record"
                            }
                          />
                          {association.allocatedAmount !== undefined &&
                          association.allocatedAmount > numericAmount ? (
                            <span className="text-red-600">
                              No puede superar el monto del record.
                            </span>
                          ) : null}
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div />
              )}

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
                  value={creditCardId ? `card:${creditCardId}` : paymentType}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith("card:")) {
                      const nextCardId = value.slice(5);
                      const card = dataset.creditCards.find(
                        (item) => item.id === nextCardId,
                      );
                      setCreditCardId(nextCardId);
                      setPaymentType("credit");
                      setCurrency(card?.limitCurrency ?? "UYU");
                      setExchangeRateToLimitCurrency("1");
                      return;
                    }
                    setCreditCardId("");
                    setPaymentType(value as PaymentType);
                    const nextAccountId =
                      accountId || defaultAccountId(dataset);
                    setAccountId(nextAccountId);
                    const account = dataset.accounts.find(
                      (item) => item.id === nextAccountId,
                    );
                    if (account) setCurrency(account.currency);
                  }}
                  className={fieldClassName}
                >
                  <option value="cash">{paymentTypeLabels.cash}</option>
                  <option value="debit">{paymentTypeLabels.debit}</option>
                  {dataset.creditCards
                    .filter((card) => card.isActive)
                    .map((card) => (
                      <option key={card.id} value={`card:${card.id}`}>
                        Credit **** {card.lastFour} - {card.name}
                      </option>
                    ))}
                  <option value="transfer">{paymentTypeLabels.transfer}</option>
                  <option value="other">{paymentTypeLabels.other}</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Status</span>
                <select
                  value={paymentStatus}
                  onChange={(event) =>
                    setPaymentStatus(event.target.value as PaymentStatus)
                  }
                  className={fieldClassName}
                >
                  <option value="cleared">{paymentStatusLabels.cleared}</option>
                  <option value="pending">{paymentStatusLabels.pending}</option>
                  <option value="needs_review">
                    {paymentStatusLabels.needs_review}
                  </option>
                  <option value="cancelled">
                    {paymentStatusLabels.cancelled}
                  </option>
                </select>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Note</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={fieldClassName}
                placeholder="Optional description"
              />
            </label>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {editingId ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteEditingRecord}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeRecordDialog}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!canSubmit}>
                {editingId ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId ? "Save changes" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit">
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
              onChange={(event) =>
                setRecordFilters({
                  paymentStatus: event.target.value as PaymentStatus | "all",
                })
              }
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
              onChange={(event) =>
                setRecordFilters({ accountId: event.target.value || undefined })
              }
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
                  accountId: event.target.value
                    ? undefined
                    : recordFilters.accountId,
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
            <Button
              className="w-full"
              variant="outline"
              onClick={clearRecordFilters}
            >
              <FilterX className="h-4 w-4" />
              Reset
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{filteredRecords.length} records</CardTitle>
              <div className="flex flex-wrap gap-2">
                {!isSelectedRangeComplete ? <Badge variant="warning">Loading complete range...</Badge> : null}
                <Badge variant="muted">
                  {selectedPeriodMode === "all"
                    ? "All history"
                    : selectedPeriodMode === "custom"
                    ? `${format(parseISO(selectedDateRange.from), "dd/MM/yyyy")} - ${format(parseISO(selectedDateRange.to), "dd/MM/yyyy")}`
                    : selectedMonth}
                </Badge>
                {activeFilters.map((filter) => (
                  <Badge key={String(filter)} variant="info">
                    {filter}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {Object.entries(grouped).map(([day, records]) => (
              <div key={day}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <p className="font-semibold">
                    {format(parseISO(day), "dd/MM/yyyy")}
                  </p>
                  <p className="text-muted-foreground">
                    {records.length} records
                  </p>
                </div>
                <div className="space-y-2">
                  {records.map((record) => {
                    const category = dataset.categories.find(
                      (item) => item.id === record.categoryId,
                    );
                    const account = dataset.accounts.find(
                      (item) => item.id === record.accountId,
                    );
                    const creditCard = dataset.creditCards.find(
                      (item) => item.id === record.creditCardId,
                    );
                    const tags = record.tagIds
                      .map((id) => dataset.tags.find((tag) => tag.id === id))
                      .filter(Boolean);

                    return (
                      <div
                        key={record.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => loadRecord(record)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            loadRecord(record);
                          }
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition hover:border-primary/50 hover:bg-secondary"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <CategoryIcon
                              icon={category?.icon}
                              color={category?.color ?? "#0EA5E9"}
                              size="sm"
                            />
                            <p className="font-medium">
                              {category
                                ? formatCategoryName(
                                    dataset.categories,
                                    category,
                                  )
                                : "Transfer"}
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
                                record.paymentStatus === "needs_review"
                                  ? "warning"
                                  : "muted"
                              }
                            >
                              {paymentStatusLabels[record.paymentStatus]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {creditCard
                              ? `${creditCard.name} **** ${creditCard.lastFour}`
                              : account?.name}
                            {record.counterpartyName
                              ? ` - ${record.counterpartyName}`
                              : " - No counterparty"}
                            {record.note ? ` - ${record.note}` : " - No note"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {tags.map((tag) =>
                              tag ? (
                                <Badge key={tag.id} variant="info">
                                  {tag.name}
                                </Badge>
                              ) : null,
                            )}
                            <Badge variant="muted">
                              {paymentTypeLabels[record.paymentType]}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
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
                    );
                  })}
                </div>
              </div>
            ))}
            {recordsPage.hasMore ? (
              <div className="flex justify-center pt-2">
                <Button variant="outline" disabled={isLoadingMoreRecords} onClick={() => void loadMoreRecords()}>
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
