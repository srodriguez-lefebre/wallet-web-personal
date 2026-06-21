import type {
  Account,
  Category,
  CreditCard,
  CreditCardPayment,
  CreditCardRecord,
  Debt,
  Goal,
  GoalReservation,
  Budget,
  Investment,
  InstallmentPlan,
  Tag,
  RecurringDebt,
  WalletDataset,
  WalletBootstrap,
  RecordPage,
  WalletRecord,
  WalletSettings,
} from "@shared/types";
import type { AccountPatch, BudgetPatch, CategoryPatch, CreditCardPatch, CreditCardRecordPatch, DebtPatch, GoalPatch, InstallmentPlanPatch, InvestmentPatch, RecordPatch, RecurringDebtPatch, SettingsPatch, TagPatch } from "@shared/schemas";
import type { ApiOperationId } from "@shared/api-contract";

interface ApiResponse<T> {
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

async function requestApi<T>(
  token: string,
  operationId: ApiOperationId,
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Client-Operation-Id": operationId,
      ...options.headers,
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:unauthorized"));
  }

  if (!response.ok || payload.error || payload.data === null) {
    throw new Error(payload.error?.message ?? "API request failed");
  }

  return payload.data;
}

function body(value: unknown): RequestInit {
  return {
    body: JSON.stringify(value),
  };
}

export function getWallet(token: string) {
  return requestApi<WalletDataset>(token, "wallet.get", "/api/wallet");
}

export function bootstrapWallet(token: string, recordsLimit = 200) {
  return requestApi<WalletBootstrap>(token, "wallet.bootstrap", "/api/wallet/bootstrap", {
    method: "POST",
    ...body({ recordsLimit, recordsCursor: null }),
  });
}

export function getRecordsPage(
  token: string,
  options: { limit?: number; cursor?: string | null; from?: string; to?: string } = {},
) {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 100));
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return requestApi<RecordPage>(token, "records.list", `/api/records?${query.toString()}`);
}

export function createAccount(token: string, account: Omit<Account, "id">) {
  return requestApi<Account>(token, "accounts.create", "/api/accounts", {
    method: "POST",
    ...body(account),
  });
}

export function updateAccount(
  token: string,
  accountId: string,
  account: AccountPatch,
) {
  return requestApi<Account>(token, "accounts.patch", `/api/accounts/${accountId}`, {
    method: "PATCH",
    ...body(account),
  });
}

export function deleteAccount(token: string, accountId: string) {
  return requestApi<{ deleted: true }>(token, "accounts.delete", `/api/accounts/${accountId}`, {
    method: "DELETE",
  });
}

export function createRecord(token: string, record: Omit<WalletRecord, "id">) {
  return requestApi<WalletRecord>(token, "records.create", "/api/records", {
    method: "POST",
    ...body(record),
  });
}

export function importRecords(token: string, records: Array<Omit<WalletRecord, "id">>) {
  return requestApi<WalletRecord[]>(token, "records.import", "/api/records/import", {
    method: "POST",
    ...body({ records }),
  });
}

export function updateRecord(
  token: string,
  recordId: string,
  record: RecordPatch,
) {
  return requestApi<WalletRecord>(token, "records.patch", `/api/records/${recordId}`, {
    method: "PATCH",
    ...body(record),
  });
}

export function deleteRecord(token: string, recordId: string) {
  return requestApi<{ deleted: true }>(token, "records.delete", `/api/records/${recordId}`, {
    method: "DELETE",
  });
}

export function createCategory(token: string, category: Omit<Category, "id">) {
  return requestApi<Category>(token, "categories.create", "/api/categories", {
    method: "POST",
    ...body(category),
  });
}

export function updateCategory(
  token: string,
  categoryId: string,
  category: CategoryPatch,
) {
  return requestApi<Category>(token, "categories.patch", `/api/categories/${categoryId}`, {
    method: "PATCH",
    ...body(category),
  });
}

export function deleteCategory(token: string, categoryId: string) {
  return requestApi<{ deleted: true }>(token, "categories.delete", `/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function createCreditCard(token: string, card: Omit<CreditCard, "id">) {
  return requestApi<CreditCard>(token, "cards.create", "/api/cards", {
    method: "POST",
    ...body(card),
  });
}

export function updateCreditCard(
  token: string,
  cardId: string,
  card: CreditCardPatch,
) {
  return requestApi<CreditCard>(token, "cards.patch", `/api/cards/${cardId}`, {
    method: "PATCH",
    ...body(card),
  });
}

export function deleteCreditCard(token: string, cardId: string) {
  return requestApi<{ deleted: true }>(token, "cards.delete", `/api/cards/${cardId}`, {
    method: "DELETE",
  });
}

export function createCreditCardPayment(
  token: string,
  cardId: string,
  payment: Omit<CreditCardPayment, "id" | "creditCardId">,
) {
  return requestApi<CreditCardPayment>(token, "cardPayments.create", `/api/cards/${cardId}/payments`, {
    method: "POST",
    ...body(payment),
  });
}

export function createCreditCardRecord(token: string, cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
  return requestApi<CreditCardRecord>(token, "cardRecords.create", `/api/cards/${cardId}/records`, { method: "POST", ...body(movement) });
}

export function updateCreditCardRecord(token: string, cardId: string, movementId: string, movement: CreditCardRecordPatch) {
  return requestApi<CreditCardRecord>(token, "cardRecords.patch", `/api/cards/${cardId}/records/${movementId}`, { method: "PATCH", ...body(movement) });
}

export function deleteCreditCardRecord(token: string, cardId: string, movementId: string) {
  return requestApi<{ deleted: true }>(token, "cardRecords.delete", `/api/cards/${cardId}/records/${movementId}`, { method: "DELETE" });
}

export function createCreditCardRefund(token: string, cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
  return requestApi<CreditCardRecord>(token, "cardRecords.refund", `/api/cards/${cardId}/refunds`, { method: "POST", ...body(movement) });
}

export function payCreditCardStatement(token: string, cardId: string, statementId: string, payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">) {
  return requestApi<CreditCardPayment>(token, "cardStatements.pay", `/api/cards/${cardId}/statements/${statementId}/payments`, { method: "POST", ...body(payment) });
}

export function deleteCreditCardPayment(token: string, cardId: string, paymentId: string) {
  return requestApi<{ deleted: true }>(token, "cardPayments.delete", `/api/cards/${cardId}/payments/${paymentId}`, { method: "DELETE" });
}

export function createDebt(token: string, debt: Omit<Debt, "id">) {
  return requestApi<Debt>(token, "debts.create", "/api/debts", {
    method: "POST",
    ...body(debt),
  });
}

export function updateDebt(
  token: string,
  debtId: string,
  debt: DebtPatch,
) {
  return requestApi<Debt>(token, "debts.patch", `/api/debts/${debtId}`, {
    method: "PATCH",
    ...body(debt),
  });
}

export function deleteDebt(token: string, debtId: string) {
  return requestApi<{ deleted: true }>(token, "debts.delete", `/api/debts/${debtId}`, {
    method: "DELETE",
  });
}

export function recordDebtPayment(
  token: string,
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
  return requestApi<{ debt: Debt; record: WalletRecord }>(
    token,
    "debts.pay",
    `/api/debts/${debtId}/payments`,
    {
      method: "POST",
      ...body({ ...payment, idempotencyKey: payment.idempotencyKey ?? crypto.randomUUID() }),
    },
  );
}

export function generateRecurringDebts(token: string) {
  return requestApi<Debt[]>(token, "debts.generateRecurring", "/api/debts/generate-recurring", {
    method: "POST",
  });
}

export function createRecurringDebt(
  token: string,
  recurringDebt: RecurringDebtPatch,
) {
  return requestApi<RecurringDebt>(token, "recurringDebts.create", "/api/recurring-debts", {
    method: "POST",
    ...body(recurringDebt),
  });
}

export function updateRecurringDebt(
  token: string,
  recurringDebtId: string,
  recurringDebt: Omit<RecurringDebt, "id">,
) {
  return requestApi<RecurringDebt>(
    token,
    "recurringDebts.patch",
    `/api/recurring-debts/${recurringDebtId}`,
    {
      method: "PATCH",
      ...body(recurringDebt),
    },
  );
}

export function deleteRecurringDebt(token: string, recurringDebtId: string) {
  return requestApi<{ deleted: true }>(
    token,
    "recurringDebts.delete",
    `/api/recurring-debts/${recurringDebtId}`,
    {
      method: "DELETE",
    },
  );
}

export function updateSettings(token: string, settings: SettingsPatch) {
  return requestApi<WalletSettings>(token, "settings.patch", "/api/settings", {
    method: "PATCH",
    ...body(settings),
  });
}

export const createTag = (token: string, value: Omit<Tag, "id">) => requestApi<Tag>(token, "tags.create", "/api/tags", { method: "POST", ...body(value) });
export const updateTag = (token: string, id: string, value: TagPatch) => requestApi<Tag>(token, "tags.patch", `/api/tags/${id}`, { method: "PATCH", ...body(value) });
export const deleteTag = (token: string, id: string) => requestApi<{ deleted: true }>(token, "tags.delete", `/api/tags/${id}`, { method: "DELETE" });
export const createGoal = (token: string, value: Omit<Goal, "id">) => requestApi<Goal>(token, "goals.create", "/api/goals", { method: "POST", ...body(value) });
export const updateGoal = (token: string, id: string, value: GoalPatch) => requestApi<Goal>(token, "goals.patch", `/api/goals/${id}`, { method: "PATCH", ...body(value) });
export const deleteGoal = (token: string, id: string) => requestApi<{ deleted: true }>(token, "goals.delete", `/api/goals/${id}`, { method: "DELETE" });
export const createGoalReservation = (token: string, value: Omit<GoalReservation, "id">) => requestApi<GoalReservation>(token, "goalReservations.create", "/api/goal-reservations", { method: "POST", ...body(value) });
export const deleteGoalReservation = (token: string, id: string) => requestApi<{ deleted: true }>(token, "goalReservations.delete", `/api/goal-reservations/${id}`, { method: "DELETE" });
export const createBudget = (token: string, value: Omit<Budget, "id">) => requestApi<Budget>(token, "budgets.create", "/api/budgets", { method: "POST", ...body(value) });
export const updateBudget = (token: string, id: string, value: BudgetPatch) => requestApi<Budget>(token, "budgets.patch", `/api/budgets/${id}`, { method: "PATCH", ...body(value) });
export const deleteBudget = (token: string, id: string) => requestApi<{ deleted: true }>(token, "budgets.delete", `/api/budgets/${id}`, { method: "DELETE" });
export const createInvestment = (token: string, value: Omit<Investment, "id">) => requestApi<Investment>(token, "investments.create", "/api/investments", { method: "POST", ...body(value) });
export const updateInvestment = (token: string, id: string, value: InvestmentPatch) => requestApi<Investment>(token, "investments.patch", `/api/investments/${id}`, { method: "PATCH", ...body(value) });
export const deleteInvestment = (token: string, id: string) => requestApi<{ deleted: true }>(token, "investments.delete", `/api/investments/${id}`, { method: "DELETE" });
export const createInstallmentPlan = (token: string, value: Omit<InstallmentPlan, "id">) => requestApi<InstallmentPlan>(token, "installmentPlans.create", "/api/installment-plans", { method: "POST", ...body(value) });
export const updateInstallmentPlan = (token: string, id: string, value: InstallmentPlanPatch) => requestApi<InstallmentPlan>(token, "installmentPlans.patch", `/api/installment-plans/${id}`, { method: "PATCH", ...body(value) });
export const deleteInstallmentPlan = (token: string, id: string) => requestApi<{ deleted: true }>(token, "installmentPlans.delete", `/api/installment-plans/${id}`, { method: "DELETE" });
