import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { mockWalletData } from "@shared/mock-data";
import type { WalletDataset } from "@shared/types";

interface WalletContextValue {
  dataset: WalletDataset;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [dataset] = useState<WalletDataset>(mockWalletData);
  const [selectedMonth, setSelectedMonth] = useState("2026-06");

  const value = useMemo(
    () => ({ dataset, selectedMonth, setSelectedMonth }),
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
