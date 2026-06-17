import type {
  AccountType,
  CurrencyCode,
  DebtDirection,
  DebtStatus,
  GoalStatus,
  Investment,
  PaymentStatus,
  PaymentType,
  RecordType,
} from "./types.js";

export const currencyLabels: Record<CurrencyCode, string> = {
  UYU: "Uruguayan peso",
  USD: "US dollar",
  EUR: "Euro",
  BRL: "Brazilian real",
  ARS: "Argentine peso",
};

export const accountTypeLabels: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  credit_card: "Credit card",
  savings: "Savings",
  recurring: "Recurring",
  investment: "Investment",
  custom: "Custom",
};

export const recordTypeLabels: Record<RecordType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export const paymentTypeLabels: Record<PaymentType, string> = {
  cash: "Cash",
  debit: "Debit",
  credit: "Credit",
  transfer: "Transfer",
  other: "Other",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  cleared: "Cleared",
  pending: "Pending",
  cancelled: "Cancelled",
};

export const goalStatusLabels: Record<GoalStatus, string> = {
  active: "Active",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const investmentTypeLabels: Record<Investment["type"], string> = {
  stock: "Stock",
  fund: "Fund",
  crypto: "Crypto",
  deposit: "Deposit",
  other: "Other",
};

export const debtDirectionLabels: Record<DebtDirection, string> = {
  payable: "I owe",
  receivable: "They owe me",
};

export const debtStatusLabels: Record<DebtStatus, string> = {
  active: "Active",
  paid: "Paid",
  paused: "Paused",
};

export const primaryCurrency: CurrencyCode = "UYU";

export const todayIso = "2026-06-15T12:00:00.000Z";
