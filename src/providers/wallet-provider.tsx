import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { readStorage, writeStorage } from "@/lib/storage";
import { useAuth } from "@/providers/auth-provider";
import * as walletApi from "@/services/wallet-api";
import { WalletSync } from "@/lib/wallet-sync";
import { importRecordBatches } from "@/lib/record-import";
import { useTheme } from "@/providers/theme-provider";
import type { GoalPatch, RecordPatch, SettingsPatch } from "@shared/schemas";
import {
  availableMonthKeys,
  dateKey,
  dateRangeForMonth,
  monthKey,
} from "@shared/calculations";
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
  Investment,
  InstallmentPlan,
  RecordFilters,
  RecurringDebt,
  Tag,
  WalletDataset,
  RecordPage,
  WalletRecord,
} from "@shared/types";

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
  requestNewRecord: () => void;
  consumeNewRecordRequest: () => void;
  recordFilters: RecordFilters;
  setRecordFilters: (filters: RecordFilters) => void;
  clearRecordFilters: () => void;
  addAccount: (account: Omit<Account, "id">) => Promise<string>;
  updateAccount: (
    accountId: string,
    account: Omit<Account, "id">,
  ) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  addRecord: (record: Omit<WalletRecord, "id">) => Promise<void>;
  importRecords: (records: Array<Omit<WalletRecord, "id">>) => Promise<number>;
  updateRecord: (
    recordId: string,
    record: RecordPatch,
  ) => Promise<void>;
  deleteRecord: (recordId: string) => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<string>;
  updateCategory: (
    categoryId: string,
    category: Omit<Category, "id">,
  ) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  addCreditCard: (card: Omit<CreditCard, "id">) => Promise<string>;
  updateCreditCard: (
    cardId: string,
    card: Omit<CreditCard, "id">,
  ) => Promise<void>;
  deleteCreditCard: (cardId: string) => Promise<void>;
  addCreditCardPayment: (
    cardId: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId">,
  ) => Promise<void>;
  addCreditCardRecord: (
    cardId: string,
    movement: Omit<
      CreditCardRecord,
      "id" | "creditCardId" | "walletRecordId" | "statementId"
    >,
  ) => Promise<void>;
  updateCreditCardRecord: (
    cardId: string,
    movementId: string,
    movement: Omit<
      CreditCardRecord,
      "id" | "creditCardId" | "walletRecordId" | "statementId"
    >,
  ) => Promise<void>;
  deleteCreditCardRecord: (cardId: string, movementId: string) => Promise<void>;
  addCreditCardRefund: (
    cardId: string,
    movement: Omit<
      CreditCardRecord,
      "id" | "creditCardId" | "walletRecordId" | "statementId"
    >,
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
  addGoalReservation: (
    reservation: Omit<GoalReservation, "id">,
  ) => Promise<void>;
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
  updateInvestment: (
    investmentId: string,
    investment: Omit<Investment, "id">,
  ) => Promise<void>;
  deleteInvestment: (investmentId: string) => Promise<void>;
  addInstallmentPlan: (plan: Omit<InstallmentPlan, "id">) => Promise<string>;
  updateInstallmentPlan: (
    planId: string,
    plan: Omit<InstallmentPlan, "id">,
  ) => Promise<void>;
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
  addRecurringDebt: (
    recurringDebt: Omit<RecurringDebt, "id">,
  ) => Promise<string>;
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
  getBackupDataset: () => Promise<WalletDataset>;
  restoreBackup: (backup: WalletDataset) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const datasetCacheKey = "wallet-dataset-cache";
const cacheSchemaVersion = 2;
const cacheMaxAgeMs = 24 * 60 * 60 * 1000;

const emptyDataset: WalletDataset = {
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

function sessionOwnerKey(token: string | null) {
  if (!token) return null;
  try {
    const encoded = token.split(".")[0];
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return (JSON.parse(atob(normalized)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

function readCachedDataset(token: string | null) {
  const cached = readStorage(datasetCacheKey);
  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as {
      schemaVersion: number;
      cachedAt: string;
      environment: string;
      ownerKey: string;
      dataset: WalletDataset;
      recordsPage: Omit<RecordPage, "items">;
    };
    const ownerKey = sessionOwnerKey(token);
    const environment = window.location.origin;
    if (
      parsed.schemaVersion !== cacheSchemaVersion ||
      !ownerKey ||
      parsed.ownerKey !== ownerKey ||
      parsed.environment !== environment
    )
      return null;
    if (Date.now() - new Date(parsed.cachedAt).getTime() > cacheMaxAgeMs)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function cacheDataset(
  dataset: WalletDataset,
  recordsPage: Omit<RecordPage, "items">,
  token: string,
) {
  const ownerKey = sessionOwnerKey(token);
  if (!ownerKey) return;
  writeStorage(
    datasetCacheKey,
    JSON.stringify({
      schemaVersion: cacheSchemaVersion,
      cachedAt: new Date().toISOString(),
      environment: window.location.origin,
      ownerKey,
      dataset,
      recordsPage,
    }),
  );
}

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

  const dates = records.map((record) => record.occurredAt.slice(0, 10));
  return {
    from: dates.reduce((oldest, current) =>
      current < oldest ? current : oldest,
    ),
    to: dates.reduce((latest, current) =>
      current > latest ? current : latest,
    ),
  };
}

function defaultRecordAccountId(dataset: WalletDataset) {
  const activeVisibleAccounts = dataset.accounts.filter(
    (account) => account.isActive && account.isVisible,
  );

  return (
    activeVisibleAccounts.find(
      (account) => account.id === dataset.settings.primaryAccountId,
    )?.id ??
    activeVisibleAccounts[0]?.id ??
    dataset.accounts.find((account) => account.isActive)?.id
  );
}

export function WalletProvider({ children }: PropsWithChildren) {
  const { token, lock } = useAuth();
  const { setTheme } = useTheme();
  const [initialCache] = useState(() => readCachedDataset(token));
  const [hasCachedDataset] = useState(() => Boolean(initialCache));
  const [dataset, setDataset] = useState<WalletDataset>(
    () => initialCache?.dataset ?? emptyDataset,
  );
  const [recordsPage, setRecordsPage] = useState<Omit<RecordPage, "items">>(
    () => initialCache?.recordsPage ?? { nextCursor: null, hasMore: false },
  );
  const [isLoadingMoreRecords, setIsLoadingMoreRecords] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !hasCachedDataset);
  const [pendingReads, setPendingReads] = useState(1);
  const isRefreshing = pendingReads > 0;
  const [loadError, setLoadError] = useState("");
  const [selectedMonth, setSelectedMonthState] = useState(() =>
    monthKey(new Date()),
  );
  const [selectedPeriodMode, setSelectedPeriodMode] =
    useState<PeriodMode>("month");
  const [customDateRange, setCustomDateRangeState] = useState(
    defaultCustomDateRange,
  );
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
  const [recordFilters, setRecordFiltersState] = useState<RecordFilters>(
    () => ({
      type: "all",
      accountId: defaultRecordAccountId(dataset),
    }),
  );

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

  function requireToken() {
    if (!token) throw new Error("Missing API token");
    return token;
  }

  const [sync] = useState(
    () =>
      new WalletSync<WalletDataset>((next) => {
        setDataset(next);
        setRecordsPage({ nextCursor: null, hasMore: false });
        setLoadError("");
        if (token)
          cacheDataset(next, { nextCursor: null, hasMore: false }, token);
      }),
  );
  const [hasLoaded, setHasLoaded] = useState(hasCachedDataset);
  const [pendingMutations, setPendingMutations] = useState(0);
  const isMutating = pendingMutations > 0;
  const isAllHistoryComplete =
    !recordsPage.hasMore &&
    !isRefreshing &&
    !isMutating &&
    !loadError &&
    hasLoaded;
  const isSelectedRangeComplete = isAllHistoryComplete;

  useEffect(() => {
    sync.activate();
    let cancelled = false;
    // Bootstrap generates due recurring debts, then obtain the canonical complete
    // snapshot. One epoch owns both reads so edits invalidate the entire load.
    void sync
      .read(async () => {
        await walletApi.bootstrapWallet(token!);
        return walletApi.getWallet(token!);
      })
      .then((result) => {
        if (!cancelled && result) setHasLoaded(true);
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not refresh cached wallet",
          );
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
  }, [sync, token]);

  useEffect(() => {
    setTheme(dataset.settings.theme);
  }, [dataset.settings.theme, setTheme]);

  async function getCompleteDataset() {
    setPendingReads((count) => count + 1);
    try {
      const result = await sync.refresh(() =>
        walletApi.getWallet(requireToken()),
      );
      setHasLoaded(true);
      return result;
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load complete wallet",
      );
      throw error;
    } finally {
      setIsLoading(false);
      setPendingReads((count) => Math.max(0, count - 1));
    }
  }
  async function getBackupDataset(){
    setPendingReads(count=>count+1);
    try{return await sync.snapshot(()=>walletApi.getWalletBackup(requireToken()));}
    finally{setPendingReads(count=>Math.max(0,count-1));}
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

  async function mutate<T>(write: () => Promise<T>): Promise<T> {
    setPendingMutations((count) => count + 1);
    try {
      const result = await sync.mutate(write, () =>
        walletApi.getWallet(requireToken()),
      );
      setHasLoaded(true);
      return result;
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not save wallet",
      );
      throw error;
    } finally {
      setPendingMutations((count) => Math.max(0, count - 1));
    }
  }

  useEffect(() => {
    const months = availableMonthKeys(dataset.records);
    if (
      selectedPeriodMode === "month" &&
      months.length > 0 &&
      !months.includes(selectedMonth)
    ) {
      queueMicrotask(() => setSelectedMonthState(months[0]));
    }
  }, [dataset.records, selectedMonth, selectedPeriodMode]);

  function setRecordFilters(filters: RecordFilters) {
    setRecordFiltersState((current) => ({
      ...current,
      ...filters,
    }));
  }

  function clearRecordFilters() {
    setRecordFiltersState({ type: "all" });
  }

  function requestNewRecord() {
    setRecordFiltersState({
      type: "all",
      accountId: defaultRecordAccountId(dataset),
    });
    setNewRecordRequestId(Date.now());
  }

  function consumeNewRecordRequest() {
    setNewRecordRequestId(0);
  }

  async function addAccount(value: Omit<Account, "id">) {
    return (await mutate(() => walletApi.createAccount(requireToken(), value)))
      .id;
  }
  async function updateAccount(id: string, value: Omit<Account, "id">) {
    await mutate(() => walletApi.updateAccount(requireToken(), id, value));
  }
  async function deleteAccount(id: string) {
    await mutate(() => walletApi.deleteAccount(requireToken(), id));
    setRecordFiltersState((current) => ({
      ...current,
      accountId: current.accountId === id ? undefined : current.accountId,
    }));
  }
  async function addCategory(value: Omit<Category, "id">) {
    return (await mutate(() => walletApi.createCategory(requireToken(), value)))
      .id;
  }
  async function updateCategory(id: string, value: Omit<Category, "id">) {
    await mutate(() => walletApi.updateCategory(requireToken(), id, value));
  }
  async function deleteCategory(id: string) {
    await mutate(() => walletApi.deleteCategory(requireToken(), id));
    setRecordFiltersState((current) => ({
      ...current,
      // Archiving a parent also reassigns its children.
      categoryId: undefined,
    }));
  }
  async function addCreditCard(value: Omit<CreditCard, "id">) {
    return (
      await mutate(() => walletApi.createCreditCard(requireToken(), value))
    ).id;
  }
  async function updateCreditCard(id: string, value: Omit<CreditCard, "id">) {
    await mutate(() => walletApi.updateCreditCard(requireToken(), id, value));
  }
  async function deleteCreditCard(id: string) {
    await mutate(() => walletApi.deleteCreditCard(requireToken(), id));
  }
  async function addTag(value: Omit<Tag, "id">) {
    return (await mutate(() => walletApi.createTag(requireToken(), value))).id;
  }
  async function updateTag(id: string, value: Omit<Tag, "id">) {
    await mutate(() => walletApi.updateTag(requireToken(), id, value));
  }
  async function deleteTag(id: string) {
    await mutate(() => walletApi.deleteTag(requireToken(), id));
    setRecordFiltersState((current) => ({
      ...current,
      tagId: current.tagId === id ? undefined : current.tagId,
    }));
  }
  async function addGoal(value: Omit<Goal, "id">) {
    return (await mutate(() => walletApi.createGoal(requireToken(), value))).id;
  }
  async function updateGoal(id: string, value: GoalPatch) {
    await mutate(() => walletApi.updateGoal(requireToken(), id, value));
  }
  async function deleteGoal(id: string) {
    await mutate(() => walletApi.deleteGoal(requireToken(), id));
  }
  async function addBudget(value: Omit<Budget, "id">) {
    return (await mutate(() => walletApi.createBudget(requireToken(), value)))
      .id;
  }
  async function updateBudget(id: string, value: Omit<Budget, "id">) {
    await mutate(() => walletApi.updateBudget(requireToken(), id, value));
  }
  async function deleteBudget(id: string) {
    await mutate(() => walletApi.deleteBudget(requireToken(), id));
  }
  async function addInvestment(value: Omit<Investment, "id">) {
    return (
      await mutate(() => walletApi.createInvestment(requireToken(), value))
    ).id;
  }
  async function updateInvestment(id: string, value: Omit<Investment, "id">) {
    await mutate(() => walletApi.updateInvestment(requireToken(), id, value));
  }
  async function deleteInvestment(id: string) {
    await mutate(() => walletApi.deleteInvestment(requireToken(), id));
  }
  async function addInstallmentPlan(value: Omit<InstallmentPlan, "id">) {
    return (
      await mutate(() => walletApi.createInstallmentPlan(requireToken(), value))
    ).id;
  }
  async function updateInstallmentPlan(
    id: string,
    value: Omit<InstallmentPlan, "id">,
  ) {
    await mutate(() =>
      walletApi.updateInstallmentPlan(requireToken(), id, value),
    );
  }
  async function deleteInstallmentPlan(id: string) {
    await mutate(() => walletApi.deleteInstallmentPlan(requireToken(), id));
  }
  async function addDebt(value: Omit<Debt, "id">) {
    return (await mutate(() => walletApi.createDebt(requireToken(), value))).id;
  }
  async function updateDebt(id: string, value: Omit<Debt, "id">) {
    await mutate(() => walletApi.updateDebt(requireToken(), id, value));
  }
  async function deleteDebt(id: string) {
    await mutate(() => walletApi.deleteDebt(requireToken(), id));
  }
  async function addRecurringDebt(value: Omit<RecurringDebt, "id">) {
    return (
      await mutate(() => walletApi.createRecurringDebt(requireToken(), value))
    ).id;
  }
  async function updateRecurringDebt(
    id: string,
    value: Omit<RecurringDebt, "id">,
  ) {
    await mutate(() =>
      walletApi.updateRecurringDebt(requireToken(), id, value),
    );
  }
  async function deleteRecurringDebt(id: string) {
    await mutate(() => walletApi.deleteRecurringDebt(requireToken(), id));
  }
  async function restoreBackup(backup: WalletDataset) {
    await mutate(() => walletApi.restoreWallet(requireToken(), backup));
  }

  async function addRecord(record: Omit<WalletRecord, "id">) {
    await mutate(() => walletApi.createRecord(requireToken(), record));
  }
  async function updateRecord(id: string, record: RecordPatch) {
    await mutate(() => walletApi.updateRecord(requireToken(), id, record));
  }
  async function deleteRecord(id: string) {
    await mutate(() => walletApi.deleteRecord(requireToken(), id));
  }
  async function importRecords(records: Array<Omit<WalletRecord, "id">>) {
    return mutate(async () => {
      const complete = await walletApi.getWallet(requireToken());
      return importRecordBatches(records, complete.records, (batch) =>
        walletApi.importRecords(requireToken(), batch),
      );
    });
  }
  async function updateWalletSettings(settings: SettingsPatch) {
    await mutate(() => walletApi.updateSettings(requireToken(), settings));
  }
  async function addCreditCardPayment(
    id: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId">,
  ) {
    await mutate(() =>
      walletApi.createCreditCardPayment(requireToken(), id, payment),
    );
  }

  async function addCreditCardRecord(
    id: string,
    value: Omit<
      CreditCardRecord,
      "id" | "creditCardId" | "walletRecordId" | "statementId"
    >,
  ) {
    await mutate(() =>
      walletApi.createCreditCardRecord(requireToken(), id, value),
    );
  }
  async function addCreditCardRefund(
    id: string,
    value: Omit<
      CreditCardRecord,
      "id" | "creditCardId" | "walletRecordId" | "statementId"
    >,
  ) {
    await mutate(() =>
      walletApi.createCreditCardRefund(requireToken(), id, value),
    );
  }
  async function updateCreditCardRecord(
    id: string,
    movementId: string,
    value: Omit<
      CreditCardRecord,
      "id" | "creditCardId" | "walletRecordId" | "statementId"
    >,
  ) {
    await mutate(() =>
      walletApi.updateCreditCardRecord(requireToken(), id, movementId, value),
    );
  }
  async function deleteCreditCardRecord(id: string, movementId: string) {
    await mutate(() =>
      walletApi.deleteCreditCardRecord(requireToken(), id, movementId),
    );
  }
  async function deleteCreditCardPayment(id: string, paymentId: string) {
    await mutate(() =>
      walletApi.deleteCreditCardPayment(requireToken(), id, paymentId),
    );
  }
  async function payCreditCardStatement(
    id: string,
    statementId: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">,
  ) {
    await mutate(() =>
      walletApi.payCreditCardStatement(
        requireToken(),
        id,
        statementId,
        payment,
      ),
    );
  }
  async function addGoalReservation(value: Omit<GoalReservation, "id">) {
    await mutate(() => walletApi.createGoalReservation(requireToken(), value));
  }
  async function deleteGoalReservation(id: string) {
    await mutate(() => walletApi.deleteGoalReservation(requireToken(), id));
  }
  async function releaseGoalReservation(value: {
    goalId: string;
    accountId: string;
    amount: number;
    note?: string;
  }) {
    await mutate(() => walletApi.releaseGoalReservation(requireToken(), value));
  }
  async function recordDebtPayment(
    id: string,
    payment: Parameters<typeof walletApi.recordDebtPayment>[2],
  ) {
    await mutate(() =>
      walletApi.recordDebtPayment(requireToken(), id, payment),
    );
  }
  async function toggleAccountVisibility(id: string) {
    const account = dataset.accounts.find((item) => item.id === id);
    if (account)
      await updateAccount(id, { ...account, isVisible: !account.isVisible });
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
            <Button onClick={() => void reloadWallet().catch(() => undefined)}>
              Retry
            </Button>
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
        requestNewRecord,
        consumeNewRecordRequest,
        recordFilters,
        setRecordFilters,
        clearRecordFilters,
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
        <div
          role="alert"
          className="border border-amber-500 bg-card p-3 text-sm"
        >
          Showing the last loaded data. {loadError}
          <Button
            variant="outline"
            onClick={() => void reloadWallet().catch(() => undefined)}
          >
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
