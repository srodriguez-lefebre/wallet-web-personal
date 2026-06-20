import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Edit3, FilterX, Plus, Save, Trash2, X } from "lucide-react";
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
  calculateCreditCardSummary,
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

function defaultAccountId(dataset: WalletDataset) {
  const activeVisibleAccounts = dataset.accounts.filter(
    (account) => account.isActive && account.isVisible,
  );
  return (
    activeVisibleAccounts.find(
      (account) => account.id === (dataset.settings.defaultAccountId ?? dataset.settings.primaryAccountId),
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
  } = useWallet();

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<RecordType>("expense");
  const [accountId, setAccountId] = useState(defaultAccountId(dataset));
  const [creditCardId, setCreditCardId] = useState(recordFilters.creditCardId ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [exchangeRateToLimitCurrency, setExchangeRateToLimitCurrency] = useState("1");
  const [destinationAccountId, setDestinationAccountId] = useState(
    defaultDestinationAccountId(dataset, defaultAccountId(dataset)),
  );
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [accountAmount, setAccountAmount] = useState("");
  const [note, setNote] = useState("");
  const [tagId, setTagId] = useState("");
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
  const canSubmit =
    Number(amount) > 0 &&
    Boolean(accountId) &&
    (type === "transfer" ? Boolean(destinationAccountId) : Boolean(categoryId));
  const selectedCard = dataset.creditCards.find((card) => card.id === creditCardId);
  const purchaseInLimitCurrency =
    Number(amount) * (Number(exchangeRateToLimitCurrency) || 0);
  const cardSummaryBeforeEdit = useMemo(() => {
    if (!selectedCard) return undefined;

    const summaryDataset = editingId
      ? {
          ...dataset,
          records: dataset.records.filter((record) => record.id !== editingId),
          creditCardRecords: dataset.creditCardRecords.filter((record) => record.walletRecordId !== editingId),
        }
      : dataset;
    const occurredAt = new Date(occurredAtLocal).getTime();
    const asOf = new Date(Number.isNaN(occurredAt) ? 0 : occurredAt);
    return calculateCreditCardSummary(summaryDataset, selectedCard, asOf);
  }, [dataset, editingId, occurredAtLocal, selectedCard]);
  const projectedCardUsage =
    (cardSummaryBeforeEdit?.usedLimit ?? 0) + purchaseInLimitCurrency;
  const exceedsCardLimit =
    Boolean(selectedCard) && projectedCardUsage > (selectedCard?.creditLimit ?? 0);

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
      const defaultCard = dataset.creditCards.find((card) => card.id === dataset.settings.defaultCreditCardId && card.isActive);
      const nextCard = requestedCard ?? defaultCard;
      setAccountId(nextAccountId);
      setCreditCardId(nextCard?.id ?? "");
      setCurrency(nextCard?.limitCurrency ?? dataset.accounts.find((account) => account.id === nextAccountId)?.currency ?? "UYU");
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
      selectedPeriodMode === "custom"
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
      ? dataset.creditCards.find((card) => card.id === recordFilters.creditCardId)
          ?.name
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
    recordFilters.search,
  ].filter(Boolean);

  function resetForm(nextType: RecordType = "expense") {
    const nextAccountId = defaultAccountId(dataset);
    setEditingId(null);
    setType(nextType);
    setAccountId(nextAccountId);
    const defaultCard = dataset.creditCards.find((card) => card.id === dataset.settings.defaultCreditCardId && card.isActive);
    setCreditCardId(nextType === "transfer" ? "" : defaultCard?.id ?? "");
    setCurrency(
      dataset.accounts.find((account) => account.id === nextAccountId)?.currency ??
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
    setPaymentType(nextType === "transfer" ? "transfer" : defaultCard ? "credit" : dataset.settings.defaultPaymentType);
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

    const account = dataset.accounts.find((item) => item.id === accountId);
    const card = dataset.creditCards.find((item) => item.id === creditCardId);
    const limitRate = Number(exchangeRateToLimitCurrency) || 1;

    return {
      type,
      amount: numericAmount,
      currency: creditCardId ? currency : ((account?.currency ?? currency) as CurrencyCode),
      accountId,
      accountAmount: creditCardId ? Number(accountAmount) || numericAmount * limitRate : undefined,
      creditCardId: creditCardId || undefined,
      destinationAccountId:
        type === "transfer" ? destinationAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      counterpartyName: counterpartyName.trim() || undefined,
      tagIds: tagId ? [tagId] : [],
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
              Adjust type, amount, account, category, tags, and payment status.
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

            {selectedCard && Number(amount) > 0 ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  exceedsCardLimit
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-border bg-secondary/40 text-muted-foreground"
                }`}
              >
                {exceedsCardLimit
                  ? `Warning: this movement takes the card to ${formatMoney(projectedCardUsage, selectedCard.limitCurrency)}, above its ${formatMoney(selectedCard.creditLimit, selectedCard.limitCurrency)} limit. You can still save it.`
                  : `${formatMoney(purchaseInLimitCurrency, selectedCard.limitCurrency)} will consume the card limit; ${formatMoney(selectedCard.creditLimit - projectedCardUsage, selectedCard.limitCurrency)} will remain available.`}
              </div>
            ) : null}

            {creditCardId ? <label className="block space-y-2"><span className="text-sm font-medium">Amount debited from account</span><input className={fieldClassName} type="number" min="0" step="0.01" value={accountAmount} placeholder={String(purchaseInLimitCurrency || amount)} onChange={(event) => setAccountAmount(event.target.value)} /></label> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Account</span>
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={fieldClassName}>
                  {dataset.accounts.filter((account) => account.isActive && account.isVisible).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              {creditCardId ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Purchase currency</span>
                    <select
                      value={currency}
                      onChange={(event) => {
                        const nextCurrency = event.target.value as CurrencyCode;
                        setCurrency(nextCurrency);
                        const card = dataset.creditCards.find((item) => item.id === creditCardId);
                        if (card?.limitCurrency === nextCurrency) setExchangeRateToLimitCurrency("1");
                      }}
                      className={fieldClassName}
                    >
                      {(["UYU", "USD", "EUR", "BRL", "ARS"] as CurrencyCode[]).map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  {dataset.creditCards.find((item) => item.id === creditCardId)?.limitCurrency !== currency ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Rate to limit currency</span>
                      <input
                        value={exchangeRateToLimitCurrency}
                        onChange={(event) => setExchangeRateToLimitCurrency(event.target.value)}
                        className={fieldClassName}
                        type="number"
                        min="0"
                        step="0.000001"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

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
              <label className="block space-y-2">
                <span className="text-sm font-medium">Tag</span>
                <div className="flex min-h-10 flex-wrap gap-2 rounded-md border bg-background p-2">
                  <button
                    type="button"
                    onClick={() => setTagId("")}
                    className={
                      tagId
                        ? "rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary"
                        : "rounded-md border border-primary bg-primary px-2 py-1 text-xs text-primary-foreground"
                    }
                  >
                    No tag
                  </button>
                  {dataset.tags.map((tag) => {
                    const isSelected = tag.id === tagId;

                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setTagId(tag.id)}
                        className={
                          isSelected
                            ? "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-foreground"
                            : "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary"
                        }
                        style={{
                          borderColor: tag.color,
                          backgroundColor: isSelected
                            ? `${tag.color}22`
                            : undefined,
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </label>

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
                      const card = dataset.creditCards.find((item) => item.id === nextCardId);
                      setCreditCardId(nextCardId);
                      setPaymentType("credit");
                      setCurrency(card?.limitCurrency ?? "UYU");
                      setExchangeRateToLimitCurrency("1");
                      return;
                    }
                    setCreditCardId("");
                    setPaymentType(value as PaymentType);
                    const nextAccountId = accountId || defaultAccountId(dataset);
                    setAccountId(nextAccountId);
                    const account = dataset.accounts.find((item) => item.id === nextAccountId);
                    if (account) setCurrency(account.currency);
                  }}
                  className={fieldClassName}
                >
                  <option value="cash">{paymentTypeLabels.cash}</option>
                  <option value="debit">{paymentTypeLabels.debit}</option>
                  {dataset.creditCards.filter((card) => card.isActive).map((card) => (
                    <option key={card.id} value={`card:${card.id}`}>
                      Credit •••• {card.lastFour} — {card.name}
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
                  accountId: event.target.value ? undefined : recordFilters.accountId,
                })
              }
              className={fieldClassName}
            >
              <option value="">Cards</option>
              {dataset.creditCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} •••• {card.lastFour}
                </option>
              ))}
            </select>
            <select
              value={recordFilters.categoryId ?? ""}
              onChange={(event) =>
                setRecordFilters({
                  categoryId: event.target.value || undefined,
                })
              }
              className={fieldClassName}
            >
              <option value="">Categories</option>
              {sortCategoriesForSelect(dataset.categories).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? `-- ${category.name}` : category.name}
                </option>
              ))}
            </select>
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
                <Badge variant="muted">
                  {selectedPeriodMode === "custom"
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
                            <Badge variant="muted">
                              {paymentStatusLabels[record.paymentStatus]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {creditCard
                              ? `${creditCard.name} •••• ${creditCard.lastFour}`
                              : account?.name}
                            {record.counterpartyName
                              ? ` · ${record.counterpartyName}`
                              : " · No counterparty"}
                            {record.note ? ` · ${record.note}` : " · No note"}
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
                              void runAction(
                                () => deleteRecord(record.id),
                                {
                                  processing: "Deleting record...",
                                  success: "Record deleted",
                                  error: "Could not delete record",
                                },
                              ).catch(() => undefined);
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
