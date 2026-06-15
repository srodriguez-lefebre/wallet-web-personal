import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { mockWalletData } from "@shared/mock-data";
import type {
  Goal,
  GoalReservation,
  Investment,
  RecordFilters,
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
  addRecord: (record: Omit<WalletRecord, "id">) => void;
  updateRecord: (recordId: string, record: Omit<WalletRecord, "id">) => void;
  deleteRecord: (recordId: string) => void;
  addGoal: (goal: Omit<Goal, "id">) => string;
  updateGoal: (goalId: string, goal: Omit<Goal, "id">) => void;
  deleteGoal: (goalId: string) => void;
  addGoalReservation: (reservation: Omit<GoalReservation, "id">) => void;
  addInvestment: (investment: Omit<Investment, "id">) => string;
  toggleAccountVisibility: (accountId: string) => void;
  setPrimaryAccount: (accountId: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

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
      addRecord,
      updateRecord,
      deleteRecord,
      addGoal,
      updateGoal,
      deleteGoal,
      addGoalReservation,
      addInvestment,
      toggleAccountVisibility,
      setPrimaryAccount,
    }),
    [dataset, recordFilters, selectedMonth],
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
