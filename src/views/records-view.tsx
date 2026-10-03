import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import * as Select from "@radix-ui/react-select";
import {
  Check,
  ChevronDown,
  Copy,
  Edit3,
  FilterX,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountStateSummary } from "@/components/wallet/account-state-summary";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { CategoryPicker } from "@/components/wallet/category-picker";
import { normalizeGlobalSearch } from "@/lib/global-search";
import { prepareTemplateDraft } from "@/lib/record-templates";
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
import { findExchangeRate } from "@shared/money";
import {
  recordAccountAmount,
  scaleConvertedAmount,
} from "@/lib/record-form-money";
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
                <CategoryIcon
                  icon={category.icon}
                  color={category.color}
                  size="sm"
                />
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
    setAllPeriod,
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
    getCompleteDataset,
  } = useWallet();

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState("");
  const [recordCreateUncertain, setRecordCreateUncertain] = useState(false);
  const recordCreateNeedsReview = useRef(false);
  const templateDraftRevision = useRef(0);
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
  const [destinationAmount, setDestinationAmount] = useState("");
  const conversionBasis = useRef<{
    source?: { amount: string; converted: string };
    destination?: { amount: string; converted: string };
  }>({});
  const [primaryRate, setPrimaryRate] = useState("");
  const [moneyError, setMoneyError] = useState("");
  const recordSubmission = useRef(false);
  const [note, setNote] = useState("");
  const [tagId, setTagId] = useState("");
  const [goalAssociations, setGoalAssociations] = useState<
    RecordGoalAssociation[]
  >([]);
  const [counterpartyName, setCounterpartyName] = useState("");
  const [occurredAtLocal, setOccurredAtLocal] = useState(() =>
    toDateTimeLocal(new Date()),
  );
  const [paymentType, setPaymentType] = useState<PaymentType>("debit");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("cleared");
  const { toast, runAction } = useActionToast();
  const reviewCount = dataset.records.filter(
    (record) => record.paymentStatus === "needs_review",
  ).length;
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
  const editingLinkedRefund = dataset.creditCardRecords.find(
    (record) => record.walletRecordId === editingId && record.kind === "refund",
  );
  const canSubmit =
    numericAmount > 0 &&
    Boolean(accountId || (type === "expense" && creditCardId)) &&
    (type === "transfer"
      ? Boolean(destinationAccountId)
      : Boolean(categoryId)) &&
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
      templateDraftRevision.current += 1;
      setTemplateNotice("");
      recordCreateNeedsReview.current = false;
      setRecordCreateUncertain(false);
      openedNewRecordRef.current = newRecordRequestId;
      const nextAccountId = defaultAccountId(dataset);
      const requestedCard = dataset.creditCards.find(
        (card) => card.id === recordFilters.creditCardId && card.isActive,
      );
      setEditingId(null);
      setType("expense");
      const defaultCard = dataset.creditCards.find(
        (card) =>
          dataset.settings.defaultPaymentType === "credit" &&
          card.id === dataset.settings.defaultCreditCardId &&
          card.isActive,
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
      conversionBasis.current = {};
      setAccountAmount("");
      setDestinationAmount("");
      setPrimaryRate("");
      setMoneyError("");
      setNote("");
      setTagId("");
      setCounterpartyName("");
      setOccurredAtLocal(toDateTimeLocal(new Date()));
      setPaymentType(nextCard ? "credit" : dataset.settings.defaultPaymentType);
      setPaymentStatus(dataset.settings.defaultPaymentStatus);
      setGoalAssociations([]);
      if (newRecordTemplateId) {
        const template = dataset.recordTemplates?.find(
          (item) => item.id === newRecordTemplateId,
        );
        if (template) {
          const { value, limitRate, problems } = prepareTemplateDraft(
            template,
            dataset,
          );
          setType(value.type);
          setAmount(String(value.amount));
          setCurrency(value.currency);
          setAccountId(value.accountId ?? "");
          setCreditCardId(value.creditCardId ?? "");
          setDestinationAccountId(value.destinationAccountId ?? "");
          setCategoryId(value.categoryId ?? "");
          setTagId(value.tagId ?? "");
          setCounterpartyName(value.counterpartyName ?? "");
          setNote(value.note ?? "");
          setPaymentType(value.paymentType);
          setExchangeRateToLimitCurrency(limitRate);
          setTemplateNotice(
            problems.length
              ? problems.join(" ")
              : "Borrador desde plantilla. Revisá la fecha y las conversiones antes de confirmar.",
          );
        } else
          setTemplateNotice(
            "La plantilla ya no está disponible. Podés completar un movimiento nuevo.",
          );
      }
      setIsRecordDialogOpen(true);
      consumeNewRecordRequest();
    });
  }, [
    consumeNewRecordRequest,
    dataset,
    newRecordRequestId,
    newRecordTemplateId,
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
        return normalizeGlobalSearch(haystack).includes(
          normalizeGlobalSearch(recordFilters.search ?? ""),
        );
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
    templateDraftRevision.current += 1;
    conversionBasis.current = {};
    setTemplateNotice("");
    recordCreateNeedsReview.current = false;
    setRecordCreateUncertain(false);
    const nextAccountId = defaultAccountId(dataset);
    setEditingId(null);
    setType(nextType);
    setAccountId(nextAccountId);
    const defaultCard = dataset.creditCards.find(
      (card) =>
        dataset.settings.defaultPaymentType === "credit" &&
        card.id === dataset.settings.defaultCreditCardId &&
        card.isActive,
    );
    setCreditCardId(nextType === "expense" ? (defaultCard?.id ?? "") : "");
    setCurrency(
      (nextType === "expense" ? defaultCard?.limitCurrency : undefined) ??
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
    setDestinationAmount("");
    setPrimaryRate("");
    setMoneyError("");
    setNote("");
    setTagId("");
    const date = new Date().toISOString().slice(0, 10);
    setGoalAssociations(
      dataset.goals
        .filter(
          (goal) =>
            goal.status === "active" &&
            goal.autoCaptureEnabled &&
            goal.autoCaptureStart &&
            goal.autoCaptureEnd &&
            goal.autoCaptureStart <= date &&
            goal.autoCaptureEnd >= date,
        )
        .map((goal) => ({
          goalId: goal.id,
          assignmentSource: "date_rule",
          useReserved: true,
          reserveIncome: true,
        })),
    );
    setCounterpartyName("");
    setOccurredAtLocal(toDateTimeLocal(new Date()));
    setPaymentType(
      nextType === "transfer"
        ? "transfer"
        : nextType === "expense" && defaultCard
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
    templateDraftRevision.current += 1;
    setTemplateNotice("");
    setEditingId(record.id);
    recordCreateNeedsReview.current = false;
    setRecordCreateUncertain(false);
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
    setDestinationAmount(
      record.destinationAmount === undefined
        ? ""
        : String(record.destinationAmount),
    );
    conversionBasis.current = {
      source:
        record.accountAmount === undefined
          ? undefined
          : {
              amount: String(record.amount),
              converted: String(record.accountAmount),
            },
      destination:
        record.destinationAmount === undefined
          ? undefined
          : {
              amount: String(record.amount),
              converted: String(record.destinationAmount),
            },
    };
    setPrimaryRate(String(record.exchangeRateToPrimary));
    setMoneyError("");
    setNote(record.note ?? "");
    setTagId(record.tagIds[0] ?? "");
    setGoalAssociations(
      record.goalAssociations ??
        (record.goalIds ?? []).map((goalId) => ({
          goalId,
          assignmentSource: "manual",
          useReserved: true,
          reserveIncome: true,
        })),
    );
    setCounterpartyName(record.counterpartyName ?? "");
    setOccurredAtLocal(toDateTimeLocal(record.occurredAt));
    setPaymentType(record.paymentType);
    setPaymentStatus(record.paymentStatus);
    setIsRecordDialogOpen(true);
  }

  function duplicateEditingRecord() {
    const record = dataset.records.find((item) => item.id === editingId);
    if (!record) return;
    resetForm(record.type);
    const now = new Date();
    const account = dataset.accounts.find(
      (item) => item.id === record.accountId && item.isActive,
    );
    const card =
      record.type === "expense"
        ? dataset.creditCards.find(
            (item) => item.id === record.creditCardId && item.isActive,
          )
        : undefined;
    const destination = dataset.accounts.find(
      (item) =>
        item.id === record.destinationAccountId &&
        item.isActive &&
        item.id !== account?.id,
    );
    setAccountId(account?.id ?? "");
    setCreditCardId(card?.id ?? "");
    setDestinationAccountId(
      record.type === "transfer" ? (destination?.id ?? "") : "",
    );
    setCurrency(record.currency);
    setAmount(String(record.amount));
    setCategoryId(record.categoryId ?? "");
    setCounterpartyName(record.counterpartyName ?? "");
    setNote(record.note ?? "");
    setTagId(record.tagIds[0] ?? "");
    setPaymentType(
      record.type === "transfer"
        ? "transfer"
        : card
          ? "credit"
          : record.paymentType === "credit"
            ? "debit"
            : record.paymentType,
    );
    setExchangeRateToLimitCurrency(
      card
        ? String(
            findExchangeRate(
              dataset.exchangeRates,
              record.currency,
              card.limitCurrency,
              now.toISOString(),
            ) ?? "",
          )
        : "1",
    );
    setOccurredAtLocal(toDateTimeLocal(now));
  }

  function openReviewQueue() {
    clearRecordFilters();
    setAllPeriod();
    setRecordFilters({ paymentStatus: "needs_review" });
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
      card
        ? String(
            findExchangeRate(dataset.exchangeRates, next, card.limitCurrency) ??
              "",
          )
        : "1",
    );
  }

  function buildRecord(): Omit<WalletRecord, "id"> | null {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return null;
    if (hasInvalidGoalAllocation) return null;

    const account = dataset.accounts.find((item) => item.id === accountId);
    const card = dataset.creditCards.find((item) => item.id === creditCardId);
    const limitRate = Number(exchangeRateToLimitCurrency);
    const original = editingId
      ? dataset.records.find((record) => record.id === editingId)
      : undefined;
    const date =
      original && toDateTimeLocal(original.occurredAt) === occurredAtLocal
        ? original.occurredAt
        : dateTimeLocalToIso(occurredAtLocal);
    const frozenPrimaryRate =
      Number(primaryRate) ||
      findExchangeRate(
        dataset.exchangeRates,
        currency,
        dataset.settings.primaryCurrency,
        date,
      );
    const sourceRate = account
      ? findExchangeRate(
          dataset.exchangeRates,
          currency,
          account.currency,
          date,
        )
      : 1;
    const destination = dataset.accounts.find(
      (item) => item.id === destinationAccountId,
    );
    const destinationRate = destination
      ? findExchangeRate(
          dataset.exchangeRates,
          currency,
          destination.currency,
          date,
        )
      : 1;
    const unchangedAmount =
      original?.amount === numericAmount && original.currency === currency;
    const sourceAmount = account
      ? recordAccountAmount(
          numericAmount,
          currency,
          account.currency,
          accountAmount,
          sourceRate,
          unchangedAmount && original?.accountId === accountId,
        )
      : undefined;
    const targetAmount =
      type === "transfer" && destination
        ? recordAccountAmount(
            numericAmount,
            currency,
            destination.currency,
            destinationAmount,
            destinationRate,
            unchangedAmount &&
              original?.destinationAccountId === destinationAccountId,
          )
        : undefined;
    if (
      !frozenPrimaryRate ||
      sourceAmount === null ||
      targetAmount === null ||
      (card && !(limitRate > 0))
    ) {
      setMoneyError(
        "Ingresá los importes convertidos y una cotización válida para las monedas elegidas.",
      );
      return null;
    }

    return {
      type,
      amount: numericAmount,
      currency,
      accountId: accountId || undefined,
      accountAmount: sourceAmount,
      creditCardId: creditCardId || undefined,
      destinationAccountId:
        type === "transfer" ? destinationAccountId : undefined,
      destinationAmount: targetAmount,
      categoryId: type === "transfer" ? undefined : categoryId,
      counterpartyName: counterpartyName.trim() || undefined,
      tagIds: tagId ? [tagId] : [],
      goalIds: goalAssociations.map((association) => association.goalId),
      goalAssociations,
      paymentType,
      paymentStatus,
      exchangeRateToPrimary: frozenPrimaryRate,
      amountInLimitCurrency: card
        ? unchangedAmount &&
          original?.creditCardId === creditCardId &&
          original.exchangeRateToLimitCurrency === limitRate
          ? original.amountInLimitCurrency
          : numericAmount * limitRate
        : undefined,
      exchangeRateToLimitCurrency: card ? limitRate : undefined,
      occurredAt: date,
      note: note || undefined,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (recordSubmission.current) return;
    if (!editingId && recordCreateNeedsReview.current) return;
    if (creditCardId && type !== "expense" && !editingLinkedRefund) {
      setMoneyError(
        "Use Cards to refund a purchase. Income and transfers cannot select a credit card.",
      );
      return;
    }
    const nextRecord = editingLinkedRefund ? null : buildRecord();
    if (!nextRecord && !editingLinkedRefund) return;
    recordSubmission.current = true;
    const revision = templateDraftRevision.current;

    try {
      if (editingId) {
        await runAction(
          () =>
            updateRecord(
              editingId,
              editingLinkedRefund
                ? {
                    categoryId,
                    counterpartyName: counterpartyName.trim() || null,
                    note: note || null,
                    tagIds: tagId ? [tagId] : [],
                    goalIds: goalAssociations.map((item) => item.goalId),
                    goalAssociations,
                  }
                : { ...nextRecord!, creditCardId: creditCardId || null },
            ),
          {
            processing: "Saving record...",
            success: "Record saved",
            error: "Could not save record",
          },
        );
      } else {
        await runAction(() => addRecord(nextRecord!), {
          processing: "Creating record...",
          success: "Record created",
          error: "Could not create record",
        });
      }
    } catch {
      if (!editingId && revision === templateDraftRevision.current) {
        recordCreateNeedsReview.current = true;
        setRecordCreateUncertain(true);
      }
      return;
    } finally {
      recordSubmission.current = false;
    }

    if (revision === templateDraftRevision.current) closeRecordDialog();
  }

  async function reviewUncertainRecord() {
    if (recordSubmission.current) return;
    const revision = templateDraftRevision.current;
    recordSubmission.current = true;
    try {
      await getCompleteDataset();
      if (revision !== templateDraftRevision.current) return;
      clearRecordFilters();
      setAllPeriod();
      closeRecordDialog();
    } catch {
      if (revision === templateDraftRevision.current)
        setMoneyError(
          "Could not reload the wallet. Review the outcome before creating this movement again.",
        );
    } finally {
      recordSubmission.current = false;
    }
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
          onClick={openReviewQueue}
          aria-label="Open review queue"
        >
          Needs review{" "}
          {isAllHistoryComplete ? `(${reviewCount})` : "· Loading…"}
        </Button>
        <Button onClick={openNewRecordDialog}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </PageHeader>

      {selectedPeriodMode === "all" &&
        recordFilters.paymentStatus === "needs_review" && (
          <p className="mb-4 text-sm text-muted-foreground" role="status">
            Review queue · All dates. Review each draft before it affects your
            balances.
          </p>
        )}

      {selectedAccountBalance ? (
        <AccountStateSummary balance={selectedAccountBalance} />
      ) : null}

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
            {recordCreateUncertain && (
              <div className="rounded-md border p-3 space-y-2">
                <p role="alert" className="text-sm">
                  The save outcome is uncertain; this movement may already
                  exist. Reload and review your records before creating it
                  again.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void reviewUncertainRecord()}
                >
                  Reload and review records
                </Button>
              </div>
            )}
            {templateNotice && (
              <p role="status" className="text-sm text-muted-foreground">
                {templateNotice}
              </p>
            )}
            {editingLinkedRefund && (
              <p className="text-sm text-muted-foreground">
                Bank-linked card refund amounts and payment details are managed
                in Cards. You can edit its category, counterparty, goals, tags
                and note here.
              </p>
            )}
            {moneyError && (
              <p role="alert" className="text-sm text-red-500">
                {moneyError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Moneda del movimiento
                <select
                  disabled={Boolean(editingLinkedRefund)}
                  value={currency}
                  onChange={(event) =>
                    changeCurrency(event.target.value as CurrencyCode)
                  }
                  className={fieldClassName}
                >
                  {["UYU", "USD", "EUR", "BRL", "ARS"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              {
                <label className="space-y-1 text-sm">
                  Cotización a {dataset.settings.primaryCurrency}
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
                      ) ?? "Ingresá cotización",
                    )}
                    className={fieldClassName}
                    inputMode="decimal"
                  />
                </label>
              }
              {accountId &&
                dataset.accounts.find((item) => item.id === accountId)
                  ?.currency !== currency && (
                  <label className="space-y-1 text-sm">
                    Importe en cuenta (
                    {
                      dataset.accounts.find((item) => item.id === accountId)
                        ?.currency
                    }
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
                      placeholder="Calculado con cotización histórica"
                    />
                  </label>
                )}
              {type === "transfer" && (
                <label className="space-y-1 text-sm">
                  Importe recibido (
                  {
                    dataset.accounts.find(
                      (item) => item.id === destinationAccountId,
                    )?.currency
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
                    placeholder="Calculado con cotización histórica"
                  />
                </label>
              )}
              {creditCardId && (
                <label className="space-y-1 text-sm">
                  Cotización a moneda del límite
                  <input
                    disabled={Boolean(editingLinkedRefund)}
                    value={exchangeRateToLimitCurrency}
                    onChange={(event) =>
                      setExchangeRateToLimitCurrency(event.target.value)
                    }
                    className={fieldClassName}
                    inputMode="decimal"
                  />
                </label>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary p-1">
              {(["expense", "income", "transfer"] as RecordType[]).map(
                (item) => (
                  <button
                    key={item}
                    disabled={Boolean(editingLinkedRefund)}
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
                  disabled={Boolean(editingLinkedRefund)}
                  value={amount}
                  onChange={(event) => {
                    const next = limitDecimalPlaces(event.target.value);
                    const source = conversionBasis.current.source;
                    const destination = conversionBasis.current.destination;
                    if (source)
                      setAccountAmount(
                        scaleConvertedAmount(
                          source.converted,
                          source.amount,
                          next,
                        ),
                      );
                    if (destination)
                      setDestinationAmount(
                        scaleConvertedAmount(
                          destination.converted,
                          destination.amount,
                          next,
                        ),
                      );
                    setAmount(next);
                  }}
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                />
              </label>

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
                      const next = dataset.accounts.find(
                        (item) => item.id === nextId,
                      );
                      if (next) changeCurrency(next.currency);
                      setPrimaryRate("");
                    }
                  }}
                  className={fieldClassName}
                >
                  {!(type === "expense" && creditCardId && dataset.records.find(record => record.id === editingId)?.accountId) && <option value="">
                    {type === "expense" && creditCardId
                      ? "Card only"
                      : "Choose account"}
                  </option>}
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
                    const key =
                      type === "income" ? "reserveIncome" : "useReserved";

                    return (
                      <div
                        key={goal.id}
                        className="space-y-2 rounded-md border p-2"
                      >
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
                  disabled={Boolean(editingLinkedRefund)}
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
                      changeCurrency(card?.limitCurrency ?? "UYU");
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

              {
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Status</span>
                  <select
                    disabled={Boolean(editingLinkedRefund)}
                    value={paymentStatus}
                    onChange={(event) =>
                      setPaymentStatus(event.target.value as PaymentStatus)
                    }
                    className={fieldClassName}
                  >
                    <option value="cleared">
                      {paymentStatusLabels.cleared}
                    </option>
                    <option value="pending">
                      {paymentStatusLabels.pending}
                    </option>
                    <option value="needs_review">
                      {paymentStatusLabels.needs_review}
                    </option>
                    <option value="cancelled">
                      {paymentStatusLabels.cancelled}
                    </option>
                  </select>
                </label>
              }
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
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(editingLinkedRefund)}
                    onClick={handleDeleteEditingRecord}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeRecordDialog}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={!canSubmit || (!editingId && recordCreateUncertain)}
              >
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
                <Button
                  variant="outline"
                  disabled={isLoadingMoreRecords}
                  onClick={() => void loadMoreRecords()}
                >
                  {isLoadingMoreRecords
                    ? "Loading records..."
                    : "Load older records"}
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
