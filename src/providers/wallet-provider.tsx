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
import { mockWalletData } from "@shared/mock-data";
import {
  availableMonthKeys,
  dateKey,
  dateRangeForMonth,
  monthKey,
} from "@shared/calculations";
import type {
  Account,
  Category,
  CreditCard,
  CreditCardPayment,
  CreditCardRecord,
  DateRange,
  Debt,
  Goal,
  GoalReservation,
  Investment,
  RecordFilters,
  RecurringDebt,
  Tag,
  WalletDataset,
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
  addInvestment: (investment: Omit<Investment, "id">) => Promise<string>;
  updateInvestment: (
    investmentId: string,
    investment: Omit<Investment, "id">,
  ) => Promise<void>;
  deleteInvestment: (investmentId: string) => Promise<void>;
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
}

const WalletContext = createContext<WalletContextValue | null>(null);
const datasetCacheKey = "wallet-dataset-cache";

function localId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function readCachedDataset() {
  const cached = readStorage(datasetCacheKey);
  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as WalletDataset;
    return {
      ...parsed,
      recurringDebts: parsed.recurringDebts ?? [],
      creditCards: parsed.creditCards ?? [],
      creditCardRecords: parsed.creditCardRecords ?? [],
      creditCardStatements: parsed.creditCardStatements ?? [],
      creditCardPayments: parsed.creditCardPayments ?? [],
      creditCardPaymentAllocations: parsed.creditCardPaymentAllocations ?? [],
    };
  } catch {
    return null;
  }
}

function cacheDataset(dataset: WalletDataset) {
  writeStorage(datasetCacheKey, JSON.stringify(dataset));
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

async function loadWalletDataset(apiToken: string) {
  const nextDataset = await walletApi.getWallet(apiToken);
  const generatedDebts = await walletApi.generateRecurringDebts(apiToken);

  if (generatedDebts.length === 0) return nextDataset;

  return {
    ...nextDataset,
    debts: [...generatedDebts, ...nextDataset.debts],
  };
}

export function WalletProvider({ children }: PropsWithChildren) {
  const { token, lock } = useAuth();
  const [hasCachedDataset] = useState(() => Boolean(readCachedDataset()));
  const [dataset, setDataset] = useState<WalletDataset>(
    () => readCachedDataset() ?? mockWalletData,
  );
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
      const nextDataset = await loadWalletDataset(token);
      setDataset(nextDataset);
      cacheDataset(nextDataset);
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
        const nextDataset = await loadWalletDataset(token);
        if (isCancelled) return;
        setDataset(nextDataset);
        cacheDataset(nextDataset);
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
    const created = {
      id: localId("tag"),
      ...tag,
    };
    setDataset((current) => ({
      ...current,
      tags: [created, ...current.tags],
    }));
    return created.id;
  }

  async function updateTag(tagId: string, tag: Omit<Tag, "id">) {
    const updated = {
      id: tagId,
      ...tag,
    };
    setDataset((current) => ({
      ...current,
      tags: current.tags.map((currentTag) =>
        currentTag.id === tagId ? updated : currentTag,
      ),
    }));
  }

  async function deleteTag(tagId: string) {
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
    const created = {
      id: localId("goal"),
      ...goal,
    };
    setDataset((current) => ({
      ...current,
      goals: [created, ...current.goals],
    }));
    return created.id;
  }

  async function updateGoal(goalId: string, goal: Omit<Goal, "id">) {
    const updated = {
      id: goalId,
      ...goal,
    };
    setDataset((current) => ({
      ...current,
      goals: current.goals.map((currentGoal) =>
        currentGoal.id === goalId ? updated : currentGoal,
      ),
    }));
  }

  async function deleteGoal(goalId: string) {
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
    const created = {
      id: localId("goal-reservation"),
      ...reservation,
    };
    setDataset((current) => ({
      ...current,
      goalReservations: [created, ...current.goalReservations],
    }));
  }

  async function addInvestment(investment: Omit<Investment, "id">) {
    const created = {
      id: localId("investment"),
      ...investment,
    };
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
    const updated = {
      id: investmentId,
      ...investment,
    };
    setDataset((current) => ({
      ...current,
      investments: current.investments.map((currentInvestment) =>
        currentInvestment.id === investmentId ? updated : currentInvestment,
      ),
    }));
  }

  async function deleteInvestment(investmentId: string) {
    setDataset((current) => ({
      ...current,
      investments: current.investments.filter(
        (investment) => investment.id !== investmentId,
      ),
    }));
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
        addInvestment,
        updateInvestment,
        deleteInvestment,
        addDebt,
        updateDebt,
        deleteDebt,
        recordDebtPayment,
        addRecurringDebt,
        updateRecurringDebt,
        deleteRecurringDebt,
        toggleAccountVisibility,
        setPrimaryAccount,
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
