export type CurrencyCode = "UYU" | "USD" | "EUR" | "BRL" | "ARS";

export type RecordType = "expense" | "income" | "transfer";

export type AccountType =
  | "cash"
  | "bank"
  | "credit_card"
  | "savings"
  | "recurring"
  | "investment"
  | "custom";

export type PaymentType = "cash" | "debit" | "credit" | "transfer" | "other";

export type PaymentStatus = "cleared" | "pending" | "cancelled";

export type GoalStatus = "active" | "completed" | "paused" | "cancelled";

export type BudgetStatus = "ok" | "warning" | "exceeded";

export type DebtStatus = "active" | "paid" | "paused";

export type DebtDirection = "payable" | "receivable";

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: number;
  color: string;
  icon: string;
  isVisible: boolean;
  isActive: boolean;
  note?: string;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  color: string;
  icon: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

export interface WalletRecord {
  id: string;
  type: RecordType;
  amount: number;
  currency: CurrencyCode;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  counterpartyName?: string;
  tagIds: string[];
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  exchangeRateToPrimary: number;
  occurredAt: string;
  note?: string;
  isFixed?: boolean;
  debtId?: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currency: CurrencyCode;
  color: string;
  icon: string;
  isVisible: boolean;
  deadline?: string;
  status: GoalStatus;
  tagIds: string[];
  accountId?: string;
  note?: string;
}

export interface GoalReservation {
  id: string;
  goalId: string;
  accountId: string;
  amount: number;
  currency: CurrencyCode;
  createdAt: string;
  note?: string;
}

export interface Budget {
  id: string;
  name: string;
  limitAmount: number;
  currency: CurrencyCode;
  period: "monthly";
  categoryId?: string;
  tagId?: string;
  accountId?: string;
  goalId?: string;
  color: string;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  date: string;
}

export interface Investment {
  id: string;
  name: string;
  type: "stock" | "fund" | "crypto" | "deposit" | "other";
  amountInvested: number;
  currentValue: number;
  currency: CurrencyCode;
  isVisible: boolean;
  startedAt: string;
  note?: string;
}

export interface Debt {
  id: string;
  name: string;
  direction: DebtDirection;
  originalAmount?: number;
  pendingAmount?: number;
  currency: CurrencyCode;
  counterpartyName: string;
  accountId?: string;
  categoryId: string;
  status: DebtStatus;
  isVisible: boolean;
  startedAt: string;
  dueAt?: string;
  note?: string;
  recurringDebtId?: string;
  recurringMonth?: string;
}

export interface RecurringDebt {
  id: string;
  name: string;
  direction: DebtDirection;
  amount?: number;
  currency: CurrencyCode;
  counterpartyName: string;
  accountId?: string;
  categoryId: string;
  dayOfMonth: number;
  isActive: boolean;
  startedAt: string;
  note?: string;
}

export interface InstallmentPlan {
  id: string;
  name: string;
  totalAmount: number;
  currency: CurrencyCode;
  installmentsTotal: number;
  installmentsPaid: number;
  accountId: string;
  categoryId: string;
  nextPaymentAt?: string;
  note?: string;
}

export interface WalletSettings {
  primaryCurrency: CurrencyCode;
  primaryAccountId?: string;
  theme: "light" | "dark" | "system";
  defaultDashboardPreset:
    | "general"
    | "spending"
    | "cash-flow"
    | "goals"
    | "accounts"
    | "monthly-review";
  locale: "es-UY";
  includeHiddenAccountsInReports: boolean;
}

export interface WalletDataset {
  settings: WalletSettings;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  records: WalletRecord[];
  goals: Goal[];
  goalReservations: GoalReservation[];
  budgets: Budget[];
  exchangeRates: ExchangeRate[];
  investments: Investment[];
  debts: Debt[];
  recurringDebts: RecurringDebt[];
  installmentPlans: InstallmentPlan[];
}

export interface RecordFilters {
  type?: RecordType | "all";
  accountId?: string;
  categoryId?: string;
  tagId?: string;
  search?: string;
}

export interface AccountBalance {
  account: Account;
  balance: number;
  balanceInPrimary: number;
  reserved: number;
  freeBalance: number;
}

export interface GoalProgress {
  goal: Goal;
  reserved: number;
  spent: number;
  committed: number;
  remaining: number;
  percentage: number;
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentage: number;
  status: BudgetStatus;
}

export interface AnalyticsSummary {
  income: number;
  expenses: number;
  cashFlow: number;
  balance: number;
  spending: number;
  dailyAverageExpense: number;
  availableDaily: number;
}

export interface VisibleDebtSummary {
  toCollect: number;
  toPay: number;
  net: number;
  openCount: number;
  amountPendingCount: number;
}
