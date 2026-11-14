import { availableMonthKeys, dateKey, dateRangeForMonth, monthKey } from "@shared/calculations";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  GoalPatch,
  InvestmentPatch,
  RecordPatch,
  RecordTemplatePatch,
  SettingsPatch,
} from "@shared/schemas";
import type {
  Account,
  Budget,
  Category,
  CreditCard,
  CreditCardPayment,
  CreditCardRecord,
  DateRange,
  Debt,
  Goal,
  GoalReservation,
  InstallmentPlan,
  Investment,
  RecordFilters,
  RecordPage,
  RecordTemplate,
  RecurringDebt,
  Tag,
  WalletDataset,
  WalletBackup,
  WalletRecord,
} from "@shared/types";

import { Button } from "@/components/ui/button";
import { importRecordBatches } from "@/lib/record-import";
import { readReferenceCache, writeReferenceCache } from "@/lib/wallet-reference-cache";
import { WalletSync } from "@/lib/wallet-sync";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

type PeriodMode = "month" | "custom" | "all";

interface WalletContextValue {
  dataset: WalletDataset;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  setAllPeriod: () => void;
  selectedPeriodMode: PeriodMode;
  selectedDateRange: DateRange;
  customDateRange: DateRange;
  setCustomDateRange: (range: DateRange) => void;
  newRecordRequestId: number;
  newRecordTemplateId: string | null;
  requestNewRecord: (templateId?: string) => void;
  consumeNewRecordRequest: () => void;
  recordFilters: RecordFilters;
  setRecordFilters: (filters: RecordFilters) => void;
  clearRecordFilters: () => void;
  isReviewQueueOpen: boolean;
  openReviewQueue: () => void;
  closeReviewQueue: () => void;
  addAccount: (account: Omit<Account, "id">) => Promise<string>;
  updateAccount: (accountId: string, account: Omit<Account, "id">) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  addRecord: (record: Omit<WalletRecord, "id">) => Promise<void>;
  importRecords: (records: Array<Omit<WalletRecord, "id">>) => Promise<number>;
  updateRecord: (recordId: string, record: RecordPatch) => Promise<WalletRecord>;
  deleteRecord: (recordId: string) => Promise<void>;
  addRecordTemplate: (template: Omit<RecordTemplate, "id">) => Promise<string>;
  updateRecordTemplate: (templateId: string, template: RecordTemplatePatch) => Promise<void>;
  deleteRecordTemplate: (templateId: string) => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<string>;
  updateCategory: (categoryId: string, category: Omit<Category, "id">) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  addCreditCard: (card: Omit<CreditCard, "id">) => Promise<string>;
  refreshCardStatements: () => Promise<void>;
  updateCreditCard: (cardId: string, card: Omit<CreditCard, "id">) => Promise<void>;
  deleteCreditCard: (cardId: string) => Promise<void>;
  addCreditCardPayment: (
    cardId: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId">,
  ) => Promise<void>;
  addCreditCardRecord: (
    cardId: string,
    movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">,
  ) => Promise<void>;
  updateCreditCardRecord: (
    cardId: string,
    movementId: string,
    movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">,
  ) => Promise<void>;
  deleteCreditCardRecord: (cardId: string, movementId: string) => Promise<void>;
  addCreditCardRefund: (
    cardId: string,
    movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">,
  ) => Promise<void>;
  payCreditCardStatement: (
    cardId: string,
    statementId: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">,
  ) => Promise<void>;
  deleteCreditCardPayment: (cardId: string, paymentId: string) => Promise<void>;
  updateWalletSettings: (settings: SettingsPatch) => Promise<void>;
  addTag: (tag: Omit<Tag, "id">) => Promise<string>;
  updateTag: (tagId: string, tag: Omit<Tag, "id">) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  addGoal: (goal: Omit<Goal, "id">) => Promise<string>;
  updateGoal: (goalId: string, goal: GoalPatch) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  addGoalReservation: (reservation: Omit<GoalReservation, "id">) => Promise<void>;
  deleteGoalReservation: (reservationId: string) => Promise<void>;
  releaseGoalReservation: (value: {
    goalId: string;
    accountId: string;
    amount: number;
    note?: string;
  }) => Promise<void>;
  addBudget: (budget: Omit<Budget, "id">) => Promise<string>;
  updateBudget: (budgetId: string, budget: Omit<Budget, "id">) => Promise<void>;
  deleteBudget: (budgetId: string) => Promise<void>;
  addInvestment: (investment: Omit<Investment, "id">) => Promise<string>;
  updateInvestment: (investmentId: string, investment: InvestmentPatch) => Promise<void>;
  deleteInvestment: (investmentId: string) => Promise<void>;
  addInstallmentPlan: (plan: Omit<InstallmentPlan, "id">) => Promise<string>;
  updateInstallmentPlan: (planId: string, plan: Omit<InstallmentPlan, "id">) => Promise<void>;
  deleteInstallmentPlan: (planId: string) => Promise<void>;
  addDebt: (debt: Omit<Debt, "id">) => Promise<string>;
  updateDebt: (debtId: string, debt: Omit<Debt, "id">) => Promise<void>;
  deleteDebt: (debtId: string) => Promise<void>;
  recordDebtPayment: (
    debtId: string,
    payment: {
      amount: number;
      accountId: string;
      accountAmount?: number;
      occurredAt: string;
      note?: string;
      saveAccountToDebt?: boolean;
      idempotencyKey?: string;
    },
  ) => Promise<void>;
  addRecurringDebt: (recurringDebt: Omit<RecurringDebt, "id">) => Promise<string>;
  updateRecurringDebt: (
    recurringDebtId: string,
    recurringDebt: Omit<RecurringDebt, "id">,
  ) => Promise<void>;
  deleteRecurringDebt: (recurringDebtId: string) => Promise<void>;
  toggleAccountVisibility: (accountId: string) => Promise<void>;
  setPrimaryAccount: (accountId: string) => Promise<void>;
  recordsPage: Omit<RecordPage, "items">;
  isLoadingMoreRecords: boolean;
  isSelectedRangeComplete: boolean;
  isAllHistoryComplete: boolean;
  loadMoreRecords: () => Promise<void>;
  getCompleteDataset: () => Promise<WalletDataset>;
  getBackupDataset: () => Promise<WalletBackup>;
  restoreBackup: (backup: WalletDataset | WalletBackup) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const emptyDataset: WalletDataset = {
  recordTemplates: [],
  settings: {
    primaryCurrency: "UYU",
    theme: "system",
    defaultDashboardPreset: "monthly-review",
    locale: "es-UY",
    includeHiddenAccountsInReports: false,
    defaultPaymentType: "debit",
    defaultPaymentStatus: "cleared",
  },
  accounts: [],
  categories: [],
  tags: [],
  records: [],
  creditCards: [],
  creditCardRecords: [],
  creditCardStatements: [],
  creditCardPayments: [],
  creditCardPaymentAllocations: [],
  goals: [],
  goalReservations: [],
  budgets: [],
  exchangeRates: [],
  investments: [],
  debts: [],
  recurringDebts: [],
  installmentPlans: [],
};

function defaultCustomDateRange(): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 6);

  return {
    from: dateKey(from),
    to: dateKey(to),
  };
}

function normalizeDateRange(range: DateRange): DateRange {
  if (range.from <= range.to) return range;
  return {
    from: range.to,
    to: range.from,
  };
}

function allHistoryDateRange(records: WalletRecord[]): DateRange {
  const today = dateKey(new Date());
  if (records.length === 0) return { from: today, to: today };

  const dates = records.map((record) => dateKey(record.occurredAt));
  return {
    from: dates.reduce((oldest, current) => (current < oldest ? current : oldest)),
    to: dates.reduce((latest, current) => (current > latest ? current : latest)),
  };
}

function defaultRecordAccountId(dataset: WalletDataset) {
  const activeVisibleAccounts = dataset.accounts.filter(
    (account) => account.isActive && account.isVisible,
  );

  return (
    activeVisibleAccounts.find((account) => account.id === dataset.settings.primaryAccountId)?.id ??
    activeVisibleAccounts[0]?.id ??
    dataset.accounts.find((account) => account.isActive)?.id
  );
}

export function WalletProvider({ children }: PropsWithChildren) {
  const { token, lock, client } = useAuth();
  const { setTheme } = useTheme();
  const [initialCache] = useState(() => readReferenceCache(token));
  const [hasCachedDataset] = useState(() => Boolean(initialCache));
  const [dataset, setDataset] = useState<WalletDataset>(() => ({
    ...emptyDataset,
    ...(initialCache ?? {}),
  }));
  const [recordsPage, setRecordsPage] = useState<Omit<RecordPage, "items">>(() => ({
    nextCursor: null,
    hasMore: Boolean(initialCache),
  }));
  const [isLoadingMoreRecords, setIsLoadingMoreRecords] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !hasCachedDataset);
  const [pendingReads, setPendingReads] = useState(1);
  const isRefreshing = pendingReads > 0;
  const [loadError, setLoadError] = useState("");
  const [selectedMonth, setSelectedMonthState] = useState(() => monthKey(new Date()));
  const [selectedPeriodMode, setSelectedPeriodMode] = useState<PeriodMode>("month");
  const [customDateRange, setCustomDateRangeState] = useState(defaultCustomDateRange);
  const selectedDateRange = useMemo(
    () =>
      selectedPeriodMode === "custom"
        ? customDateRange
        : selectedPeriodMode === "all"
          ? allHistoryDateRange(dataset.records)
          : dateRangeForMonth(selectedMonth),
    [customDateRange, dataset.records, selectedMonth, selectedPeriodMode],
  );
  const [newRecordRequestId, setNewRecordRequestId] = useState(0);
  const [newRecordTemplateId, setNewRecordTemplateId] = useState<string | null>(null);
  const [recordFilters, setRecordFiltersState] = useState<RecordFilters>(() => ({
    type: "all",
    accountId: defaultRecordAccountId(dataset),
  }));
  // Provider scope keeps the return context when Records unmounts on navigation.
  const [reviewReturnContext, setReviewReturnContext] = useState<{
    filters: RecordFilters;
    month: string;
    mode: PeriodMode;
    range: DateRange;
  } | null>(null);

  function openReviewQueue() {
    // Manual Needs review is still a normal filter. Only an existing return
    // context identifies the global queue and protects its original snapshot.
    setReviewReturnContext(
      (previous) =>
        previous ?? {
          filters: { ...recordFilters },
          month: selectedMonth,
          mode: selectedPeriodMode,
          range: { ...customDateRange },
        },
    );
    setRecordFiltersState({ type: "all", paymentStatus: "needs_review" });
    setSelectedPeriodMode("all");
  }

  function closeReviewQueue() {
    const previous = reviewReturnContext;
    setReviewReturnContext(null);
    if (previous) {
      setRecordFiltersState(previous.filters);
      setSelectedMonthState(previous.month);
      setSelectedPeriodMode(previous.mode);
      setCustomDateRangeState(previous.range);
    } else {
      setRecordFiltersState((current) => ({ ...current, paymentStatus: "all" }));
    }
  }

  function setSelectedMonth(month: string) {
    setSelectedMonthState(month);
    setSelectedPeriodMode("month");
  }

  function setAllPeriod() {
    setSelectedPeriodMode("all");
  }

  function setCustomDateRange(range: DateRange) {
    setCustomDateRangeState(normalizeDateRange(range));
    setSelectedPeriodMode("custom");
  }

  const [sync] = useState(
    () =>
      new WalletSync<WalletDataset>((next) => {
        setDataset({ ...next, recordTemplates: next.recordTemplates ?? [] });
        setRecordsPage({ nextCursor: null, hasMore: false });
        setLoadError("");
        if (token) writeReferenceCache(next, token);
      }),
  );
  const [hasLoaded, setHasLoaded] = useState(hasCachedDataset);
  const [pendingMutations, setPendingMutations] = useState(0);
  const isMutating = pendingMutations > 0;
  const isAllHistoryComplete =
    !recordsPage.hasMore && !isRefreshing && !isMutating && !loadError && hasLoaded;
  const isSelectedRangeComplete = isAllHistoryComplete;

  useEffect(() => {
    sync.activate();
    let cancelled = false;
    // Bootstrap generates due recurring debts, then obtain the canonical complete
    // snapshot. One epoch owns both reads so edits invalidate the entire load.
    void sync
      .read(async () => {
        await client["wallet.bootstrap"]({ body: { recordsLimit: 200, recordsCursor: null } });
        return client["wallet.get"]();
      })
      .then((result) => {
        if (!cancelled && result) setHasLoaded(true);
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "Could not refresh cached wallet");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setPendingReads((count) => Math.max(0, count - 1));
        }
      });
    return () => {
      cancelled = true;
      sync.deactivate();
    };
  }, [client, sync, token]);

  useEffect(() => {
    setTheme(dataset.settings.theme);
  }, [dataset.settings.theme, setTheme]);

  async function getCompleteDataset() {
    setPendingReads((count) => count + 1);
    try {
      const result = await sync.refresh(() => client["wallet.get"]());
      setHasLoaded(true);
      return result;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load complete wallet");
      throw error;
    } finally {
      setIsLoading(false);
      setPendingReads((count) => Math.max(0, count - 1));
    }
  }
  async function getBackupDataset() {
    setPendingReads((count) => count + 1);
    try {
      return await sync.snapshot(() => client["wallet.backup"]());
    } finally {
      setPendingReads((count) => Math.max(0, count - 1));
    }
  }

  async function reloadWallet() {
    await getCompleteDataset();
  }
  async function loadMoreRecords() {
    setIsLoadingMoreRecords(true);
    try {
      await reloadWallet();
    } finally {
      setIsLoadingMoreRecords(false);
    }
  }

  const mutate = useCallback(
    async <T,>(write: () => Promise<T>): Promise<T> => {
      if (!token) throw new Error("Missing API token");
      setPendingMutations((count) => count + 1);
      try {
        const result = await sync.mutate(write, () => client["wallet.get"]());
        setHasLoaded(true);
        return result;
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Could not save wallet");
        throw error;
      } finally {
        setPendingMutations((count) => Math.max(0, count - 1));
      }
    },
    [client, sync, token],
  );
  const refreshCardStatements = useCallback(async () => {
    if (!token) throw new Error("Missing API token");
    await mutate(() => client["cards.refreshStatements"]());
  }, [client, mutate, token]);

  useEffect(() => {
    const months = availableMonthKeys(dataset.records);
    const firstMonth = months[0];
    if (selectedPeriodMode === "month" && firstMonth && !months.includes(selectedMonth)) {
      queueMicrotask(() => setSelectedMonthState(firstMonth));
    }
  }, [dataset.records, selectedMonth, selectedPeriodMode]);

  function setRecordFilters(filters: RecordFilters) {
    if ("paymentStatus" in filters && filters.paymentStatus !== "needs_review")
      setReviewReturnContext(null);
    setRecordFiltersState((current) => ({
      ...current,
      ...filters,
    }));
  }

  function clearRecordFilters() {
    setReviewReturnContext(null);
    setRecordFiltersState({ type: "all" });
  }

  function requestNewRecord(templateId?: string) {
    setReviewReturnContext(null);
    setRecordFiltersState({
      type: "all",
      accountId: defaultRecordAccountId(dataset),
    });
    setNewRecordRequestId(Date.now());
    setNewRecordTemplateId(templateId ?? null);
  }

  function consumeNewRecordRequest() {
    setNewRecordRequestId(0);
    setNewRecordTemplateId(null);
  }

  async function addAccount(value: Omit<Account, "id">) {
    return (await mutate(() => client["accounts.create"]({ body: value }))).id;
  }
  async function updateAccount(id: string, value: Omit<Account, "id">) {
    await mutate(() => client["accounts.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteAccount(id: string) {
    await mutate(() => client["accounts.delete"]({ params: { id: id } }));
    setRecordFiltersState((current) => ({
      ...current,
      accountId: current.accountId === id ? undefined : current.accountId,
    }));
  }
  async function addCategory(value: Omit<Category, "id">) {
    return (await mutate(() => client["categories.create"]({ body: value }))).id;
  }
  async function updateCategory(id: string, value: Omit<Category, "id">) {
    await mutate(() => client["categories.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteCategory(id: string) {
    await mutate(() => client["categories.delete"]({ params: { id: id } }));
    setRecordFiltersState((current) => ({
      ...current,
      // Archiving a parent also reassigns its children.
      categoryId: undefined,
    }));
  }
  async function addCreditCard(value: Omit<CreditCard, "id">) {
    return (await mutate(() => client["cards.create"]({ body: value }))).id;
  }
  async function updateCreditCard(id: string, value: Omit<CreditCard, "id">) {
    await mutate(() => client["cards.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteCreditCard(id: string) {
    await mutate(() => client["cards.delete"]({ params: { id: id } }));
  }
  async function addTag(value: Omit<Tag, "id">) {
    return (await mutate(() => client["tags.create"]({ body: value }))).id;
  }
  async function updateTag(id: string, value: Omit<Tag, "id">) {
    await mutate(() => client["tags.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteTag(id: string) {
    await mutate(() => client["tags.delete"]({ params: { id: id } }));
    setRecordFiltersState((current) => ({
      ...current,
      tagId: current.tagId === id ? undefined : current.tagId,
    }));
  }
  async function addGoal(value: Omit<Goal, "id">) {
    return (await mutate(() => client["goals.create"]({ body: value }))).id;
  }
  async function updateGoal(id: string, value: GoalPatch) {
    await mutate(() => client["goals.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteGoal(id: string) {
    await mutate(() => client["goals.delete"]({ params: { id: id } }));
  }
  async function addBudget(value: Omit<Budget, "id">) {
    return (await mutate(() => client["budgets.create"]({ body: value }))).id;
  }
  async function addRecordTemplate(value: Omit<RecordTemplate, "id">) {
    return (await mutate(() => client["recordTemplates.create"]({ body: value }))).id;
  }
  async function updateRecordTemplate(id: string, value: RecordTemplatePatch) {
    await mutate(() => client["recordTemplates.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteRecordTemplate(id: string) {
    await mutate(() => client["recordTemplates.delete"]({ params: { id: id } }));
  }
  async function updateBudget(id: string, value: Omit<Budget, "id">) {
    await mutate(() => client["budgets.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteBudget(id: string) {
    await mutate(() => client["budgets.delete"]({ params: { id: id } }));
  }
  async function addInvestment(value: Omit<Investment, "id">) {
    return (await mutate(() => client["investments.create"]({ body: value }))).id;
  }
  async function updateInvestment(id: string, value: InvestmentPatch) {
    await mutate(() => client["investments.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteInvestment(id: string) {
    await mutate(() => client["investments.delete"]({ params: { id: id } }));
  }
  async function addInstallmentPlan(value: Omit<InstallmentPlan, "id">) {
    return (await mutate(() => client["installmentPlans.create"]({ body: value }))).id;
  }
  async function updateInstallmentPlan(id: string, value: Omit<InstallmentPlan, "id">) {
    await mutate(() => client["installmentPlans.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteInstallmentPlan(id: string) {
    await mutate(() => client["installmentPlans.delete"]({ params: { id: id } }));
  }
  async function addDebt(value: Omit<Debt, "id">) {
    return (await mutate(() => client["debts.create"]({ body: value }))).id;
  }
  async function updateDebt(id: string, value: Omit<Debt, "id">) {
    await mutate(() => client["debts.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteDebt(id: string) {
    await mutate(() => client["debts.delete"]({ params: { id: id } }));
  }
  async function addRecurringDebt(value: Omit<RecurringDebt, "id">) {
    return (await mutate(() => client["recurringDebts.create"]({ body: value }))).id;
  }
  async function updateRecurringDebt(id: string, value: Omit<RecurringDebt, "id">) {
    await mutate(() => client["recurringDebts.patch"]({ params: { id: id }, body: value }));
  }
  async function deleteRecurringDebt(id: string) {
    await mutate(() => client["recurringDebts.delete"]({ params: { id: id } }));
  }
  async function restoreBackup(backup: WalletDataset | WalletBackup) {
    await mutate(() => client["wallet.restore"]({ body: backup }));
  }

  async function addRecord(record: Omit<WalletRecord, "id">) {
    await mutate(() => client["records.create"]({ body: record }));
  }
  async function updateRecord(id: string, record: RecordPatch) {
    return mutate(() => client["records.patch"]({ params: { id: id }, body: record }));
  }
  async function deleteRecord(id: string) {
    await mutate(() => client["records.delete"]({ params: { id: id } }));
  }
  async function importRecords(records: Array<Omit<WalletRecord, "id">>) {
    return mutate(async () => {
      const complete = await client["wallet.get"]();
      return importRecordBatches(records, complete.records, (batch) =>
        client["records.import"]({ body: { records: batch } }),
      );
    });
  }
  async function updateWalletSettings(settings: SettingsPatch) {
    await mutate(() => client["settings.patch"]({ body: settings }));
  }
  async function addCreditCardPayment(
    id: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId">,
  ) {
    await mutate(() => client["cardPayments.create"]({ params: { id: id }, body: payment }));
  }

  async function addCreditCardRecord(
    id: string,
    value: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">,
  ) {
    await mutate(() => client["cardRecords.create"]({ params: { id: id }, body: value }));
  }
  async function addCreditCardRefund(
    id: string,
    value: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">,
  ) {
    await mutate(() => client["cardRecords.refund"]({ params: { id: id }, body: value }));
  }
  async function updateCreditCardRecord(
    id: string,
    movementId: string,
    value: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">,
  ) {
    await mutate(() =>
      client["cardRecords.patch"]({ params: { id: id, recordId: movementId }, body: value }),
    );
  }
  async function deleteCreditCardRecord(id: string, movementId: string) {
    await mutate(() => client["cardRecords.delete"]({ params: { id: id, recordId: movementId } }));
  }
  async function deleteCreditCardPayment(id: string, paymentId: string) {
    await mutate(() => client["cardPayments.delete"]({ params: { id: id, paymentId: paymentId } }));
  }
  async function payCreditCardStatement(
    id: string,
    statementId: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">,
  ) {
    await mutate(() =>
      client["cardStatements.pay"]({ params: { id: id, statementId: statementId }, body: payment }),
    );
  }
  async function addGoalReservation(value: Omit<GoalReservation, "id">) {
    await mutate(() => client["goalReservations.create"]({ body: value }));
  }
  async function deleteGoalReservation(id: string) {
    await mutate(() => client["goalReservations.delete"]({ params: { id: id } }));
  }
  async function releaseGoalReservation(value: {
    goalId: string;
    accountId: string;
    amount: number;
    note?: string;
  }) {
    await mutate(() => client["goalReservations.release"]({ body: value }));
  }
  async function recordDebtPayment(
    id: string,
    payment: Parameters<WalletContextValue["recordDebtPayment"]>[1],
  ) {
    await mutate(() =>
      client["debts.pay"]({
        params: { id: id },
        body: { ...payment, idempotencyKey: payment.idempotencyKey ?? crypto.randomUUID() },
      }),
    );
  }
  async function toggleAccountVisibility(id: string) {
    const account = dataset.accounts.find((item) => item.id === id);
    if (account) await updateAccount(id, { ...account, isVisible: !account.isVisible });
  }
  async function setPrimaryAccount(id: string) {
    await updateWalletSettings({ primaryAccountId: id });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading wallet...</p>
      </div>
    );
  }

  if (loadError && !hasLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md space-y-4 rounded-md border bg-card p-6 shadow-sm">
          <div>
            <p className="text-lg font-semibold">Could not load wallet</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void reloadWallet().catch(() => undefined)}>Retry</Button>
            <Button variant="outline" onClick={lock}>
              Lock
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        dataset,
        selectedMonth,
        setSelectedMonth,
        setAllPeriod,
        selectedPeriodMode,
        selectedDateRange,
        customDateRange,
        setCustomDateRange,
        newRecordRequestId,
        newRecordTemplateId,
        requestNewRecord,
        consumeNewRecordRequest,
        recordFilters,
        setRecordFilters,
        clearRecordFilters,
        isReviewQueueOpen: reviewReturnContext !== null,
        openReviewQueue,
        closeReviewQueue,
        addAccount,
        updateAccount,
        deleteAccount,
        addRecord,
        importRecords,
        updateRecord,
        deleteRecord,
        addCategory,
        updateCategory,
        deleteCategory,
        addCreditCard,
        refreshCardStatements,
        updateCreditCard,
        deleteCreditCard,
        addCreditCardPayment,
        addCreditCardRecord,
        updateCreditCardRecord,
        deleteCreditCardRecord,
        addCreditCardRefund,
        payCreditCardStatement,
        deleteCreditCardPayment,
        updateWalletSettings,
        addTag,
        updateTag,
        deleteTag,
        addGoal,
        updateGoal,
        deleteGoal,
        addGoalReservation,
        deleteGoalReservation,
        releaseGoalReservation,
        addBudget,
        addRecordTemplate,
        updateRecordTemplate,
        deleteRecordTemplate,
        updateBudget,
        deleteBudget,
        addInvestment,
        updateInvestment,
        deleteInvestment,
        addInstallmentPlan,
        updateInstallmentPlan,
        deleteInstallmentPlan,
        addDebt,
        updateDebt,
        deleteDebt,
        recordDebtPayment,
        addRecurringDebt,
        updateRecurringDebt,
        deleteRecurringDebt,
        toggleAccountVisibility,
        setPrimaryAccount,
        recordsPage,
        isLoadingMoreRecords,
        isSelectedRangeComplete,
        isAllHistoryComplete,
        loadMoreRecords,
        getCompleteDataset,
        getBackupDataset,
        restoreBackup,
      }}
    >
      {loadError ? (
        <div role="alert" className="border border-amber-500 bg-card p-3 text-sm">
          Showing the last loaded data. {loadError}
          <Button variant="outline" onClick={() => void reloadWallet().catch(() => undefined)}>
            Retry refresh
          </Button>
        </div>
      ) : null}
      {isRefreshing ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Refreshing wallet...
        </div>
      ) : null}
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }

  return context;
}
