import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { readStorage, writeStorage } from "@/lib/storage";
import { useAuth } from "@/providers/auth-provider";
import * as walletApi from "@/services/wallet-api";
import { mockWalletData } from "@shared/mock-data";
import { availableMonthKeys, monthKey } from "@shared/calculations";
import type {
  Account,
  Category,
  Goal,
  GoalReservation,
  Investment,
  RecordFilters,
  Tag,
  WalletDataset,
  WalletRecord,
} from "@shared/types";

interface WalletContextValue {
  dataset: WalletDataset;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  recordFilters: RecordFilters;
  setRecordFilters: (filters: RecordFilters) => void;
  clearRecordFilters: () => void;
  addAccount: (account: Omit<Account, "id">) => Promise<string>;
  updateAccount: (accountId: string, account: Omit<Account, "id">) => Promise<void>;
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
  toggleAccountVisibility: (accountId: string) => Promise<void>;
  setPrimaryAccount: (accountId: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const datasetCacheKey = "wallet-dataset-cache";

function collectCategoryTreeIds(categories: Category[], categoryId: string) {
  const ids = new Set([categoryId]);
  let didAdd = true;

  while (didAdd) {
    didAdd = false;
    categories.forEach((category) => {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        didAdd = true;
      }
    });
  }

  return ids;
}

function localId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function readCachedDataset() {
  const cached = readStorage(datasetCacheKey);
  if (!cached) return null;

  try {
    return JSON.parse(cached) as WalletDataset;
  } catch {
    return null;
  }
}

function cacheDataset(dataset: WalletDataset) {
  writeStorage(datasetCacheKey, JSON.stringify(dataset));
}

export function WalletProvider({ children }: PropsWithChildren) {
  const { token, lock } = useAuth();
  const [hasCachedDataset] = useState(() => Boolean(readCachedDataset()));
  const [dataset, setDataset] = useState<WalletDataset>(() => readCachedDataset() ?? mockWalletData);
  const [isLoading, setIsLoading] = useState(() => !hasCachedDataset);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [recordFilters, setRecordFiltersState] = useState<RecordFilters>({
    type: "all",
  });

  function requireToken() {
    if (!token) throw new Error("Missing API token");
    return token;
  }

  async function reloadWallet() {
    if (!token) return;

    setIsRefreshing(true);
    setLoadError("");
    try {
      const nextDataset = await walletApi.getWallet(token);
      setDataset(nextDataset);
      cacheDataset(nextDataset);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load wallet");
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
        const nextDataset = await walletApi.getWallet(token);
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
    if (months.length > 0 && !months.includes(selectedMonth)) {
      queueMicrotask(() => setSelectedMonth(months[0]));
    }
  }, [dataset.records, selectedMonth]);

  function setRecordFilters(filters: RecordFilters) {
    setRecordFiltersState((current) => ({
      ...current,
      ...filters,
    }));
  }

  function clearRecordFilters() {
    setRecordFiltersState({ type: "all" });
  }

  async function addAccount(account: Omit<Account, "id">) {
    const created = await walletApi.createAccount(requireToken(), account);
    setDataset((current) => ({
      ...current,
      accounts: [created, ...current.accounts],
    }));
    return created.id;
  }

  async function updateAccount(accountId: string, account: Omit<Account, "id">) {
    const updated = await walletApi.updateAccount(requireToken(), accountId, account);
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
          ? nextAccounts.find((account) => account.isVisible)?.id ?? nextAccounts[0]?.id
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
    const created = await walletApi.createRecord(requireToken(), record);
    setDataset((current) => ({
      ...current,
      records: [created, ...current.records],
    }));
  }

  async function deleteRecord(recordId: string) {
    await walletApi.deleteRecord(requireToken(), recordId);
    setDataset((current) => ({
      ...current,
      records: current.records.filter((record) => record.id !== recordId),
    }));
  }

  async function updateRecord(recordId: string, record: Omit<WalletRecord, "id">) {
    const updated = await walletApi.updateRecord(requireToken(), recordId, record);
    setDataset((current) => ({
      ...current,
      records: current.records.map((currentRecord) =>
        currentRecord.id === recordId ? updated : currentRecord,
      ),
    }));
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
    setDataset((current) => {
      const categoryIds = collectCategoryTreeIds(current.categories, categoryId);

      return {
        ...current,
        categories: current.categories.filter(
          (category) => !categoryIds.has(category.id),
        ),
        records: current.records.map((record) =>
          record.categoryId && categoryIds.has(record.categoryId)
            ? {
                ...record,
                categoryId: undefined,
              }
            : record,
        ),
        budgets: current.budgets.map((budget) =>
          budget.categoryId && categoryIds.has(budget.categoryId)
            ? {
                ...budget,
                categoryId: undefined,
              }
            : budget,
        ),
        installmentPlans: current.installmentPlans.filter(
          (plan) => !categoryIds.has(plan.categoryId),
        ),
      };
    });
    setRecordFiltersState((current) => ({
      ...current,
      categoryId: undefined,
    }));
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
    const updated = await walletApi.updateSettings(requireToken(), nextSettings);
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
