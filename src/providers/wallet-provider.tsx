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
  WalletSettings,
} from "@shared/types";

type PeriodMode = "month" | "custom";

interface WalletContextValue {
  dataset: WalletDataset;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
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
    record: Omit<WalletRecord, "id">,
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
  addCreditCardRecord: (cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) => Promise<void>;
  updateCreditCardRecord: (cardId: string, movementId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) => Promise<void>;
  deleteCreditCardRecord: (cardId: string, movementId: string) => Promise<void>;
  addCreditCardRefund: (cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) => Promise<void>;
  payCreditCardStatement: (cardId: string, statementId: string, payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">) => Promise<void>;
  deleteCreditCardPayment: (cardId: string, paymentId: string) => Promise<void>;
  updateWalletSettings: (settings: WalletSettings) => Promise<void>;
  addTag: (tag: Omit<Tag, "id">) => Promise<string>;
  updateTag: (tagId: string, tag: Omit<Tag, "id">) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  addGoal: (goal: Omit<Goal, "id">) => Promise<string>;
  updateGoal: (goalId: string, goal: Omit<Goal, "id">) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  addGoalReservation: (
    reservation: Omit<GoalReservation, "id">,
  ) => Promise<void>;
  deleteGoalReservation: (reservationId: string) => Promise<void>;
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
  loadMoreRecords: () => Promise<void>;
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
  accounts: [], categories: [], tags: [], records: [], creditCards: [],
  creditCardRecords: [], creditCardStatements: [], creditCardPayments: [],
  creditCardPaymentAllocations: [], goals: [], goalReservations: [], budgets: [],
  exchangeRates: [], investments: [], debts: [], recurringDebts: [], installmentPlans: [],
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
      schemaVersion: number; cachedAt: string; environment: string; ownerKey: string;
      dataset: WalletDataset; recordsPage: Omit<RecordPage, "items">;
    };
    const ownerKey = sessionOwnerKey(token);
    const environment = window.location.origin;
    if (parsed.schemaVersion !== cacheSchemaVersion || !ownerKey || parsed.ownerKey !== ownerKey || parsed.environment !== environment) return null;
    if (Date.now() - new Date(parsed.cachedAt).getTime() > cacheMaxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cacheDataset(dataset: WalletDataset, recordsPage: Omit<RecordPage, "items">, token: string) {
  const ownerKey = sessionOwnerKey(token);
  if (!ownerKey) return;
  writeStorage(datasetCacheKey, JSON.stringify({
    schemaVersion: cacheSchemaVersion,
    cachedAt: new Date().toISOString(),
    environment: window.location.origin,
    ownerKey,
    dataset,
    recordsPage,
  }));
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

let bootstrapInFlight: { token: string; request: ReturnType<typeof walletApi.bootstrapWallet> } | null = null;

function loadWalletBootstrap(apiToken: string) {
  if (bootstrapInFlight?.token === apiToken) return bootstrapInFlight.request;
  const request = walletApi.bootstrapWallet(apiToken).finally(() => {
    if (bootstrapInFlight?.request === request) bootstrapInFlight = null;
  });
  bootstrapInFlight = { token: apiToken, request };
  return request;
}

const rangeRequests = new Map<string, Promise<WalletRecord[]>>();

function loadRecordRange(apiToken: string, range: DateRange) {
  const key = `${apiToken}:${range.from}:${range.to}`;
  const existing = rangeRequests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const items: WalletRecord[] = [];
    let cursor: string | null = null;
    do {
      const page = await walletApi.getRecordsPage(apiToken, { limit: 500, cursor, ...range });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  })().finally(() => rangeRequests.delete(key));
  rangeRequests.set(key, request);
  return request;
}

export function WalletProvider({ children }: PropsWithChildren) {
  const { token, lock } = useAuth();
  const [initialCache] = useState(() => readCachedDataset(token));
  const [hasCachedDataset] = useState(() => Boolean(initialCache));
  const [dataset, setDataset] = useState<WalletDataset>(
    () => initialCache?.dataset ?? emptyDataset,
  );
  const [recordsPage, setRecordsPage] = useState<Omit<RecordPage, "items">>(
    () => initialCache?.recordsPage ?? { nextCursor: null, hasMore: false },
  );
  const [isLoadingMoreRecords, setIsLoadingMoreRecords] = useState(false);
  const [completeRanges, setCompleteRanges] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(() => !hasCachedDataset);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
        : dateRangeForMonth(selectedMonth),
    [customDateRange, selectedMonth, selectedPeriodMode],
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

  function setCustomDateRange(range: DateRange) {
    setCustomDateRangeState(normalizeDateRange(range));
    setSelectedPeriodMode("custom");
  }

  function requireToken() {
    if (!token) throw new Error("Missing API token");
    return token;
  }

  async function reloadWallet() {
    if (!token) return;

    setIsRefreshing(true);
    setLoadError("");
    try {
      const result = await loadWalletBootstrap(token);
      setDataset(result.dataset);
      setRecordsPage(result.recordsPage);
      setCompleteRanges(new Set());
      cacheDataset(result.dataset, result.recordsPage, token);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load wallet",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialWallet() {
      if (!token) return;

      if (hasCachedDataset) {
        setIsRefreshing(true);
      }

      try {
        const result = await loadWalletBootstrap(token);
        if (isCancelled) return;
        setDataset(result.dataset);
        setRecordsPage(result.recordsPage);
        cacheDataset(result.dataset, result.recordsPage, token);
        setLoadError("");
      } catch (error) {
        if (isCancelled) return;
        if (!hasCachedDataset) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load wallet",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadInitialWallet();
    return () => {
      isCancelled = true;
    };
  }, [hasCachedDataset, token]);

  const selectedRangeKey = `${selectedDateRange.from}:${selectedDateRange.to}`;
  const oldestLoadedRecordDate = dataset.records.at(-1)?.occurredAt.slice(0, 10);
  const isSelectedRangeComplete =
    completeRanges.has(selectedRangeKey) ||
    !recordsPage.hasMore ||
    Boolean(oldestLoadedRecordDate && oldestLoadedRecordDate < selectedDateRange.from);

  useEffect(() => {
    if (!token || isSelectedRangeComplete) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setIsLoadingMoreRecords(true);
    });
    void loadRecordRange(token, selectedDateRange)
      .then((items) => {
        if (cancelled) return;
        setDataset((current) => {
          const byId = new Map(current.records.map((record) => [record.id, record]));
          items.forEach((record) => byId.set(record.id, record));
          return { ...current, records: [...byId.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)) };
        });
        setCompleteRanges((current) => new Set(current).add(selectedRangeKey));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load records");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMoreRecords(false);
      });
    return () => { cancelled = true; };
  }, [isSelectedRangeComplete, selectedDateRange, selectedRangeKey, token]);

  async function loadMoreRecords() {
    if (!token || !recordsPage.hasMore || !recordsPage.nextCursor || isLoadingMoreRecords) return;
    setIsLoadingMoreRecords(true);
    try {
      const page = await walletApi.getRecordsPage(token, { limit: 200, cursor: recordsPage.nextCursor });
      const byId = new Map(dataset.records.map((record) => [record.id, record]));
      page.items.forEach((record) => byId.set(record.id, record));
      const nextDataset = { ...dataset, records: [...byId.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)) };
      setDataset(nextDataset);
      const nextPage = { nextCursor: page.nextCursor, hasMore: page.hasMore };
      setRecordsPage(nextPage);
      cacheDataset(nextDataset, nextPage, token);
    } finally {
      setIsLoadingMoreRecords(false);
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

  async function addAccount(account: Omit<Account, "id">) {
    const created = await walletApi.createAccount(requireToken(), account);
    setDataset((current) => ({
      ...current,
      accounts: [created, ...current.accounts],
    }));
    return created.id;
  }

  async function updateAccount(
    accountId: string,
    account: Omit<Account, "id">,
  ) {
    const updated = await walletApi.updateAccount(
      requireToken(),
      accountId,
      account,
    );
    setDataset((current) => ({
      ...current,
      accounts: current.accounts.map((currentAccount) =>
        currentAccount.id === accountId ? updated : currentAccount,
      ),
    }));
  }

  async function deleteAccount(accountId: string) {
    await walletApi.deleteAccount(requireToken(), accountId);
    setDataset((current) => {
      const nextAccounts = current.accounts.filter(
        (account) => account.id !== accountId,
      );
      const nextPrimaryAccountId =
        current.settings.primaryAccountId === accountId
          ? (nextAccounts.find((account) => account.isVisible)?.id ??
            nextAccounts[0]?.id)
          : current.settings.primaryAccountId;

      return {
        ...current,
        settings: {
          ...current.settings,
          primaryAccountId: nextPrimaryAccountId,
        },
        accounts: nextAccounts,
        records: current.records.filter(
          (record) =>
            record.accountId !== accountId &&
            record.destinationAccountId !== accountId,
        ),
        goals: current.goals.map((goal) =>
          goal.accountId === accountId
            ? {
                ...goal,
                accountId: undefined,
              }
            : goal,
        ),
        goalReservations: current.goalReservations.filter(
          (reservation) => reservation.accountId !== accountId,
        ),
        budgets: current.budgets.map((budget) =>
          budget.accountId === accountId
            ? {
                ...budget,
                accountId: undefined,
              }
            : budget,
        ),
        debts: current.debts.map((debt) =>
          debt.accountId === accountId
            ? {
                ...debt,
                accountId: undefined,
              }
            : debt,
        ),
        installmentPlans: current.installmentPlans.filter(
          (plan) => plan.accountId !== accountId,
        ),
      };
    });
  }

  async function addRecord(record: Omit<WalletRecord, "id">) {
    await walletApi.createRecord(requireToken(), record);
    await reloadWallet();
  }

  async function importRecords(records: Array<Omit<WalletRecord, "id">>) {
    const created = await walletApi.importRecords(requireToken(), records);
    setDataset((current) => ({ ...current, records: [...created, ...current.records] }));
    return created.length;
  }

  async function deleteRecord(recordId: string) {
    await walletApi.deleteRecord(requireToken(), recordId);
    await reloadWallet();
  }

  async function updateRecord(
    recordId: string,
    record: Omit<WalletRecord, "id">,
  ) {
    await walletApi.updateRecord(
      requireToken(),
      recordId,
      record,
    );
    await reloadWallet();
  }

  async function addCategory(category: Omit<Category, "id">) {
    const created = await walletApi.createCategory(requireToken(), category);
    setDataset((current) => ({
      ...current,
      categories: [created, ...current.categories],
    }));
    return created.id;
  }

  async function updateCategory(
    categoryId: string,
    category: Omit<Category, "id">,
  ) {
    const updated = await walletApi.updateCategory(
      requireToken(),
      categoryId,
      category,
    );
    setDataset((current) => ({
      ...current,
      categories: current.categories.map((currentItem) =>
        currentItem.id === categoryId ? updated : currentItem,
      ),
    }));
  }

  async function deleteCategory(categoryId: string) {
    await walletApi.deleteCategory(requireToken(), categoryId);
    await reloadWallet();
    setRecordFiltersState((current) => ({
      ...current,
      categoryId: undefined,
    }));
  }

  async function addCreditCard(card: Omit<CreditCard, "id">) {
    const created = await walletApi.createCreditCard(requireToken(), card);
    setDataset((current) => ({
      ...current,
      creditCards: [created, ...current.creditCards],
    }));
    return created.id;
  }

  async function updateCreditCard(
    cardId: string,
    card: Omit<CreditCard, "id">,
  ) {
    const updated = await walletApi.updateCreditCard(
      requireToken(),
      cardId,
      card,
    );
    setDataset((current) => ({
      ...current,
      creditCards: current.creditCards.map((currentCard) =>
        currentCard.id === cardId ? updated : currentCard,
      ),
    }));
  }

  async function deleteCreditCard(cardId: string) {
    await walletApi.deleteCreditCard(requireToken(), cardId);
    setDataset((current) => ({
      ...current,
      creditCards: current.creditCards.map((card) =>
        card.id === cardId ? { ...card, isActive: false } : card,
      ),
    }));
  }

  async function addCreditCardPayment(
    cardId: string,
    payment: Omit<CreditCardPayment, "id" | "creditCardId">,
  ) {
    const created = await walletApi.createCreditCardPayment(
      requireToken(),
      cardId,
      payment,
    );
    setDataset((current) => ({
      ...current,
      creditCardPayments: [created, ...current.creditCardPayments],
    }));
  }

  async function addCreditCardRecord(cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
    await walletApi.createCreditCardRecord(requireToken(), cardId, movement); await reloadWallet();
  }
  async function updateCreditCardRecord(cardId: string, movementId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
    await walletApi.updateCreditCardRecord(requireToken(), cardId, movementId, movement); await reloadWallet();
  }
  async function deleteCreditCardRecord(cardId: string, movementId: string) {
    await walletApi.deleteCreditCardRecord(requireToken(), cardId, movementId); await reloadWallet();
  }
  async function addCreditCardRefund(cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
    await walletApi.createCreditCardRefund(requireToken(), cardId, movement); await reloadWallet();
  }
  async function payCreditCardStatement(cardId: string, statementId: string, payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">) {
    await walletApi.payCreditCardStatement(requireToken(), cardId, statementId, payment); await reloadWallet();
  }
  async function deleteCreditCardPayment(cardId: string, paymentId: string) {
    await walletApi.deleteCreditCardPayment(requireToken(), cardId, paymentId); await reloadWallet();
  }

  async function updateWalletSettings(nextSettings: WalletSettings) {
    const updated = await walletApi.updateSettings(requireToken(), nextSettings);
    setDataset((current) => ({ ...current, settings: updated }));
  }

  async function addTag(tag: Omit<Tag, "id">) {
    const created = await walletApi.createTag(requireToken(), tag);
    setDataset((current) => ({
      ...current,
      tags: [created, ...current.tags],
    }));
    return created.id;
  }

  async function updateTag(tagId: string, tag: Omit<Tag, "id">) {
    const updated = await walletApi.updateTag(requireToken(), tagId, tag);
    setDataset((current) => ({
      ...current,
      tags: current.tags.map((currentTag) =>
        currentTag.id === tagId ? updated : currentTag,
      ),
    }));
  }

  async function deleteTag(tagId: string) {
    await walletApi.deleteTag(requireToken(), tagId);
    setDataset((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag.id !== tagId),
      records: current.records.map((record) => ({
        ...record,
        tagIds: record.tagIds.filter((currentTagId) => currentTagId !== tagId),
      })),
      goals: current.goals.map((goal) => ({
        ...goal,
        tagIds: goal.tagIds.filter((currentTagId) => currentTagId !== tagId),
      })),
      budgets: current.budgets.map((budget) =>
        budget.tagId === tagId
          ? {
              ...budget,
              tagId: undefined,
            }
          : budget,
      ),
    }));
    setRecordFiltersState((current) => ({
      ...current,
      tagId: undefined,
    }));
  }

  async function addGoal(goal: Omit<Goal, "id">) {
    const created = await walletApi.createGoal(requireToken(), goal);
    setDataset((current) => ({
      ...current,
      goals: [created, ...current.goals],
    }));
    return created.id;
  }

  async function updateGoal(goalId: string, goal: Omit<Goal, "id">) {
    const updated = await walletApi.updateGoal(requireToken(), goalId, goal);
    setDataset((current) => ({
      ...current,
      goals: current.goals.map((currentGoal) =>
        currentGoal.id === goalId ? updated : currentGoal,
      ),
    }));
  }

  async function deleteGoal(goalId: string) {
    await walletApi.deleteGoal(requireToken(), goalId);
    setDataset((current) => ({
      ...current,
      goals: current.goals.filter((goal) => goal.id !== goalId),
      goalReservations: current.goalReservations.filter(
        (reservation) => reservation.goalId !== goalId,
      ),
      budgets: current.budgets.map((budget) =>
        budget.goalId === goalId
          ? {
              ...budget,
              goalId: undefined,
            }
          : budget,
      ),
    }));
  }

  async function addGoalReservation(reservation: Omit<GoalReservation, "id">) {
    const created = await walletApi.createGoalReservation(requireToken(), reservation);
    setDataset((current) => ({
      ...current,
      goalReservations: [created, ...current.goalReservations],
    }));
  }

  async function deleteGoalReservation(reservationId: string) {
    await walletApi.deleteGoalReservation(requireToken(), reservationId);
    setDataset((current) => ({
      ...current,
      goalReservations: current.goalReservations.filter((item) => item.id !== reservationId),
    }));
  }

  async function addBudget(budget: Omit<Budget, "id">) {
    const created = await walletApi.createBudget(requireToken(), budget);
    setDataset((current) => ({ ...current, budgets: [created, ...current.budgets] }));
    return created.id;
  }

  async function updateBudget(budgetId: string, budget: Omit<Budget, "id">) {
    const updated = await walletApi.updateBudget(requireToken(), budgetId, budget);
    setDataset((current) => ({ ...current, budgets: current.budgets.map((item) => item.id === budgetId ? updated : item) }));
  }

  async function deleteBudget(budgetId: string) {
    await walletApi.deleteBudget(requireToken(), budgetId);
    setDataset((current) => ({ ...current, budgets: current.budgets.filter((item) => item.id !== budgetId) }));
  }

  async function addInvestment(investment: Omit<Investment, "id">) {
    const created = await walletApi.createInvestment(requireToken(), investment);
    setDataset((current) => ({
      ...current,
      investments: [created, ...current.investments],
    }));
    return created.id;
  }

  async function updateInvestment(
    investmentId: string,
    investment: Omit<Investment, "id">,
  ) {
    const updated = await walletApi.updateInvestment(requireToken(), investmentId, investment);
    setDataset((current) => ({
      ...current,
      investments: current.investments.map((currentInvestment) =>
        currentInvestment.id === investmentId ? updated : currentInvestment,
      ),
    }));
  }

  async function deleteInvestment(investmentId: string) {
    await walletApi.deleteInvestment(requireToken(), investmentId);
    setDataset((current) => ({
      ...current,
      investments: current.investments.filter(
        (investment) => investment.id !== investmentId,
      ),
    }));
  }

  async function addInstallmentPlan(plan: Omit<InstallmentPlan, "id">) {
    const created = await walletApi.createInstallmentPlan(requireToken(), plan);
    setDataset((current) => ({ ...current, installmentPlans: [created, ...current.installmentPlans] }));
    return created.id;
  }

  async function updateInstallmentPlan(planId: string, plan: Omit<InstallmentPlan, "id">) {
    const updated = await walletApi.updateInstallmentPlan(requireToken(), planId, plan);
    setDataset((current) => ({ ...current, installmentPlans: current.installmentPlans.map((item) => item.id === planId ? updated : item) }));
  }

  async function deleteInstallmentPlan(planId: string) {
    await walletApi.deleteInstallmentPlan(requireToken(), planId);
    setDataset((current) => ({ ...current, installmentPlans: current.installmentPlans.filter((item) => item.id !== planId) }));
  }

  async function addDebt(debt: Omit<Debt, "id">) {
    const created = await walletApi.createDebt(requireToken(), debt);
    setDataset((current) => ({
      ...current,
      debts: [created, ...current.debts],
    }));
    return created.id;
  }

  async function updateDebt(debtId: string, debt: Omit<Debt, "id">) {
    const updated = await walletApi.updateDebt(requireToken(), debtId, debt);
    setDataset((current) => ({
      ...current,
      debts: current.debts.map((currentDebt) =>
        currentDebt.id === debtId ? updated : currentDebt,
      ),
    }));
  }

  async function deleteDebt(debtId: string) {
    await walletApi.deleteDebt(requireToken(), debtId);
    setDataset((current) => ({
      ...current,
      debts: current.debts.filter((debt) => debt.id !== debtId),
      records: current.records.map((record) =>
        record.debtId === debtId
          ? {
              ...record,
              debtId: undefined,
            }
          : record,
      ),
    }));
  }

  async function recordDebtPayment(
    debtId: string,
    payment: {
      amount: number;
      accountId: string;
      occurredAt: string;
      note?: string;
      saveAccountToDebt?: boolean;
      idempotencyKey?: string;
    },
  ) {
    const result = await walletApi.recordDebtPayment(
      requireToken(),
      debtId,
      payment,
    );
    setDataset((current) => ({
      ...current,
      debts: current.debts.map((debt) =>
        debt.id === debtId ? result.debt : debt,
      ),
      records: [result.record, ...current.records],
    }));
  }

  async function addRecurringDebt(recurringDebt: Omit<RecurringDebt, "id">) {
    const created = await walletApi.createRecurringDebt(
      requireToken(),
      recurringDebt,
    );
    setDataset((current) => ({
      ...current,
      recurringDebts: [created, ...current.recurringDebts],
    }));
    return created.id;
  }

  async function updateRecurringDebt(
    recurringDebtId: string,
    recurringDebt: Omit<RecurringDebt, "id">,
  ) {
    const updated = await walletApi.updateRecurringDebt(
      requireToken(),
      recurringDebtId,
      recurringDebt,
    );
    setDataset((current) => ({
      ...current,
      recurringDebts: current.recurringDebts.map((currentRecurringDebt) =>
        currentRecurringDebt.id === recurringDebtId
          ? updated
          : currentRecurringDebt,
      ),
    }));
  }

  async function deleteRecurringDebt(recurringDebtId: string) {
    await walletApi.deleteRecurringDebt(requireToken(), recurringDebtId);
    setDataset((current) => ({
      ...current,
      recurringDebts: current.recurringDebts.filter(
        (recurringDebt) => recurringDebt.id !== recurringDebtId,
      ),
    }));
  }

  async function toggleAccountVisibility(accountId: string) {
    const account = dataset.accounts.find((item) => item.id === accountId);
    if (!account) return;

    await updateAccount(accountId, {
      ...account,
      isVisible: !account.isVisible,
    });
  }

  async function setPrimaryAccount(accountId: string) {
    const nextSettings = {
      ...dataset.settings,
      primaryAccountId: accountId,
    };
    const updated = await walletApi.updateSettings(
      requireToken(),
      nextSettings,
    );
    setDataset((current) => ({
      ...current,
      settings: updated,
    }));
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading wallet...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md space-y-4 rounded-md border bg-card p-6 shadow-sm">
          <div>
            <p className="text-lg font-semibold">Could not load wallet</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void reloadWallet()}>Retry</Button>
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
        loadMoreRecords,
      }}
    >
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
