import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { mockWalletData } from "@shared/mock-data";
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
  addAccount: (account: Omit<Account, "id">) => string;
  updateAccount: (accountId: string, account: Omit<Account, "id">) => void;
  deleteAccount: (accountId: string) => void;
  addRecord: (record: Omit<WalletRecord, "id">) => void;
  updateRecord: (recordId: string, record: Omit<WalletRecord, "id">) => void;
  deleteRecord: (recordId: string) => void;
  addCategory: (category: Omit<Category, "id">) => string;
  updateCategory: (categoryId: string, category: Omit<Category, "id">) => void;
  deleteCategory: (categoryId: string) => void;
  addTag: (tag: Omit<Tag, "id">) => string;
  updateTag: (tagId: string, tag: Omit<Tag, "id">) => void;
  deleteTag: (tagId: string) => void;
  addGoal: (goal: Omit<Goal, "id">) => string;
  updateGoal: (goalId: string, goal: Omit<Goal, "id">) => void;
  deleteGoal: (goalId: string) => void;
  addGoalReservation: (reservation: Omit<GoalReservation, "id">) => void;
  addInvestment: (investment: Omit<Investment, "id">) => string;
  updateInvestment: (
    investmentId: string,
    investment: Omit<Investment, "id">,
  ) => void;
  deleteInvestment: (investmentId: string) => void;
  toggleAccountVisibility: (accountId: string) => void;
  setPrimaryAccount: (accountId: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

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

export function WalletProvider({ children }: PropsWithChildren) {
  const [dataset, setDataset] = useState<WalletDataset>(mockWalletData);
  const [selectedMonth, setSelectedMonth] = useState("2026-06");
  const [recordFilters, setRecordFiltersState] = useState<RecordFilters>({
    type: "all",
  });

  function setRecordFilters(filters: RecordFilters) {
    setRecordFiltersState((current) => ({
      ...current,
      ...filters,
    }));
  }

  function clearRecordFilters() {
    setRecordFiltersState({ type: "all" });
  }

  function addAccount(account: Omit<Account, "id">) {
    const id = `acc-${crypto.randomUUID()}`;
    setDataset((current) => ({
      ...current,
      accounts: [
        {
          ...account,
          id,
        },
        ...current.accounts,
      ],
    }));
    return id;
  }

  function updateAccount(accountId: string, account: Omit<Account, "id">) {
    setDataset((current) => ({
      ...current,
      accounts: current.accounts.map((currentAccount) =>
        currentAccount.id === accountId
          ? {
              ...account,
              id: accountId,
            }
          : currentAccount,
      ),
    }));
  }

  function deleteAccount(accountId: string) {
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

  function addRecord(record: Omit<WalletRecord, "id">) {
    setDataset((current) => ({
      ...current,
      records: [
        {
          ...record,
          id: `rec-${crypto.randomUUID()}`,
        },
        ...current.records,
      ],
    }));
  }

  function deleteRecord(recordId: string) {
    setDataset((current) => ({
      ...current,
      records: current.records.filter((record) => record.id !== recordId),
    }));
  }

  function updateRecord(recordId: string, record: Omit<WalletRecord, "id">) {
    setDataset((current) => ({
      ...current,
      records: current.records.map((currentRecord) =>
        currentRecord.id === recordId
          ? {
              ...record,
              id: recordId,
            }
          : currentRecord,
      ),
    }));
  }

  function addCategory(category: Omit<Category, "id">) {
    const id = `cat-${crypto.randomUUID()}`;
    setDataset((current) => ({
      ...current,
      categories: [
        {
          ...category,
          id,
        },
        ...current.categories,
      ],
    }));
    return id;
  }

  function updateCategory(categoryId: string, category: Omit<Category, "id">) {
    setDataset((current) => ({
      ...current,
      categories: current.categories.map((currentItem) =>
        currentItem.id === categoryId
          ? {
              ...category,
              id: categoryId,
            }
          : currentItem,
      ),
    }));
  }

  const deleteCategory = useCallback((categoryId: string) => {
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
  }, []);

  function addTag(tag: Omit<Tag, "id">) {
    const id = `tag-${crypto.randomUUID()}`;
    setDataset((current) => ({
      ...current,
      tags: [
        {
          ...tag,
          id,
        },
        ...current.tags,
      ],
    }));
    return id;
  }

  function updateTag(tagId: string, tag: Omit<Tag, "id">) {
    setDataset((current) => ({
      ...current,
      tags: current.tags.map((currentTag) =>
        currentTag.id === tagId
          ? {
              ...tag,
              id: tagId,
            }
          : currentTag,
      ),
    }));
  }

  const deleteTag = useCallback((tagId: string) => {
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
  }, []);

  function addGoal(goal: Omit<Goal, "id">) {
    const id = `goal-${crypto.randomUUID()}`;
    setDataset((current) => ({
      ...current,
      goals: [
        {
          ...goal,
          id,
        },
        ...current.goals,
      ],
    }));
    return id;
  }

  function updateGoal(goalId: string, goal: Omit<Goal, "id">) {
    setDataset((current) => ({
      ...current,
      goals: current.goals.map((currentGoal) =>
        currentGoal.id === goalId
          ? {
              ...goal,
              id: goalId,
            }
          : currentGoal,
      ),
    }));
  }

  function deleteGoal(goalId: string) {
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

  function addGoalReservation(reservation: Omit<GoalReservation, "id">) {
    setDataset((current) => ({
      ...current,
      goalReservations: [
        {
          ...reservation,
          id: `gres-${crypto.randomUUID()}`,
        },
        ...current.goalReservations,
      ],
    }));
  }

  function addInvestment(investment: Omit<Investment, "id">) {
    const id = `inv-${crypto.randomUUID()}`;
    setDataset((current) => ({
      ...current,
      investments: [
        {
          ...investment,
          id,
        },
        ...current.investments,
      ],
    }));
    return id;
  }

  function updateInvestment(
    investmentId: string,
    investment: Omit<Investment, "id">,
  ) {
    setDataset((current) => ({
      ...current,
      investments: current.investments.map((currentInvestment) =>
        currentInvestment.id === investmentId
          ? {
              ...investment,
              id: investmentId,
            }
          : currentInvestment,
      ),
    }));
  }

  function deleteInvestment(investmentId: string) {
    setDataset((current) => ({
      ...current,
      investments: current.investments.filter(
        (investment) => investment.id !== investmentId,
      ),
    }));
  }

  function toggleAccountVisibility(accountId: string) {
    setDataset((current) => ({
      ...current,
      accounts: current.accounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              isVisible: !account.isVisible,
            }
          : account,
      ),
    }));
  }

  function setPrimaryAccount(accountId: string) {
    setDataset((current) => ({
      ...current,
      settings: {
        ...current.settings,
        primaryAccountId: accountId,
      },
    }));
  }

  const value = useMemo(
    () => ({
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
    }),
    [dataset, deleteCategory, deleteTag, recordFilters, selectedMonth],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }

  return context;
}
