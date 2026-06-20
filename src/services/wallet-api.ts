import type {
  Account,
  Category,
  CreditCard,
  CreditCardPayment,
  CreditCardRecord,
  Debt,
  RecurringDebt,
  WalletDataset,
  WalletBootstrap,
  RecordPage,
  WalletRecord,
  WalletSettings,
} from "@shared/types";
import type { AccountPatch, CategoryPatch, CreditCardPatch, CreditCardRecordPatch, DebtPatch, RecordPatch, RecurringDebtPatch, SettingsPatch } from "@shared/schemas";

interface ApiResponse<T> {
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

async function requestApi<T>(
  token: string,
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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
  return requestApi<WalletDataset>(token, "/api/wallet");
}

export function bootstrapWallet(token: string, recordsLimit = 200) {
  return requestApi<WalletBootstrap>(token, "/api/wallet/bootstrap", {
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
  return requestApi<RecordPage>(token, `/api/records?${query.toString()}`);
}

export function createAccount(token: string, account: Omit<Account, "id">) {
  return requestApi<Account>(token, "/api/accounts", {
    method: "POST",
    ...body(account),
  });
}

export function updateAccount(
  token: string,
  accountId: string,
  account: AccountPatch,
) {
  return requestApi<Account>(token, `/api/accounts/${accountId}`, {
    method: "PATCH",
    ...body(account),
  });
}

export function deleteAccount(token: string, accountId: string) {
  return requestApi<{ deleted: true }>(token, `/api/accounts/${accountId}`, {
    method: "DELETE",
  });
}

export function createRecord(token: string, record: Omit<WalletRecord, "id">) {
  return requestApi<WalletRecord>(token, "/api/records", {
    method: "POST",
    ...body(record),
  });
}

export function updateRecord(
  token: string,
  recordId: string,
  record: RecordPatch,
) {
  return requestApi<WalletRecord>(token, `/api/records/${recordId}`, {
    method: "PATCH",
    ...body(record),
  });
}

export function deleteRecord(token: string, recordId: string) {
  return requestApi<{ deleted: true }>(token, `/api/records/${recordId}`, {
    method: "DELETE",
  });
}

export function createCategory(token: string, category: Omit<Category, "id">) {
  return requestApi<Category>(token, "/api/categories", {
    method: "POST",
    ...body(category),
  });
}

export function updateCategory(
  token: string,
  categoryId: string,
  category: CategoryPatch,
) {
  return requestApi<Category>(token, `/api/categories/${categoryId}`, {
    method: "PATCH",
    ...body(category),
  });
}

export function deleteCategory(token: string, categoryId: string) {
  return requestApi<{ deleted: true }>(token, `/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function createCreditCard(token: string, card: Omit<CreditCard, "id">) {
  return requestApi<CreditCard>(token, "/api/cards", {
    method: "POST",
    ...body(card),
  });
}

export function updateCreditCard(
  token: string,
  cardId: string,
  card: CreditCardPatch,
) {
  return requestApi<CreditCard>(token, `/api/cards/${cardId}`, {
    method: "PATCH",
    ...body(card),
  });
}

export function deleteCreditCard(token: string, cardId: string) {
  return requestApi<{ deleted: true }>(token, `/api/cards/${cardId}`, {
    method: "DELETE",
  });
}

export function createCreditCardPayment(
  token: string,
  cardId: string,
  payment: Omit<CreditCardPayment, "id" | "creditCardId">,
) {
  return requestApi<CreditCardPayment>(token, `/api/cards/${cardId}/payments`, {
    method: "POST",
    ...body(payment),
  });
}

export function createCreditCardRecord(token: string, cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
  return requestApi<CreditCardRecord>(token, `/api/cards/${cardId}/records`, { method: "POST", ...body(movement) });
}

export function updateCreditCardRecord(token: string, cardId: string, movementId: string, movement: CreditCardRecordPatch) {
  return requestApi<CreditCardRecord>(token, `/api/cards/${cardId}/records/${movementId}`, { method: "PATCH", ...body(movement) });
}

export function deleteCreditCardRecord(token: string, cardId: string, movementId: string) {
  return requestApi<{ deleted: true }>(token, `/api/cards/${cardId}/records/${movementId}`, { method: "DELETE" });
}

export function createCreditCardRefund(token: string, cardId: string, movement: Omit<CreditCardRecord, "id" | "creditCardId" | "walletRecordId" | "statementId">) {
  return requestApi<CreditCardRecord>(token, `/api/cards/${cardId}/refunds`, { method: "POST", ...body(movement) });
}

export function payCreditCardStatement(token: string, cardId: string, statementId: string, payment: Omit<CreditCardPayment, "id" | "creditCardId" | "statementId">) {
  return requestApi<CreditCardPayment>(token, `/api/cards/${cardId}/statements/${statementId}/payments`, { method: "POST", ...body(payment) });
}

export function deleteCreditCardPayment(token: string, cardId: string, paymentId: string) {
  return requestApi<{ deleted: true }>(token, `/api/cards/${cardId}/payments/${paymentId}`, { method: "DELETE" });
}

export function createDebt(token: string, debt: Omit<Debt, "id">) {
  return requestApi<Debt>(token, "/api/debts", {
    method: "POST",
    ...body(debt),
  });
}

export function updateDebt(
  token: string,
  debtId: string,
  debt: DebtPatch,
) {
  return requestApi<Debt>(token, `/api/debts/${debtId}`, {
    method: "PATCH",
    ...body(debt),
  });
}

export function deleteDebt(token: string, debtId: string) {
  return requestApi<{ deleted: true }>(token, `/api/debts/${debtId}`, {
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
    `/api/debts/${debtId}/payments`,
    {
      method: "POST",
      ...body({ ...payment, idempotencyKey: payment.idempotencyKey ?? crypto.randomUUID() }),
    },
  );
}

export function generateRecurringDebts(token: string) {
  return requestApi<Debt[]>(token, "/api/debts/generate-recurring", {
    method: "POST",
  });
}

export function createRecurringDebt(
  token: string,
  recurringDebt: RecurringDebtPatch,
) {
  return requestApi<RecurringDebt>(token, "/api/recurring-debts", {
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
    `/api/recurring-debts/${recurringDebtId}`,
    {
      method: "DELETE",
    },
  );
}

export function updateSettings(token: string, settings: SettingsPatch) {
  return requestApi<WalletSettings>(token, "/api/settings", {
    method: "PATCH",
    ...body(settings),
  });
}
