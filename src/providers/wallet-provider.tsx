import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { mockWalletData } from "@shared/mock-data";
import type { WalletDataset, WalletRecord } from "@shared/types";

interface WalletContextValue {
  dataset: WalletDataset;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  addRecord: (record: Omit<WalletRecord, "id">) => void;
  deleteRecord: (recordId: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [dataset, setDataset] = useState<WalletDataset>(mockWalletData);
  const [selectedMonth, setSelectedMonth] = useState("2026-06");

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

  const value = useMemo(
    () => ({ dataset, selectedMonth, setSelectedMonth, addRecord, deleteRecord }),
    [dataset, selectedMonth],
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
