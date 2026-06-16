import type {
  Account,
  Category,
  Goal,
  GoalReservation,
  Investment,
  Tag,
  WalletDataset,
  WalletRecord,
  WalletSettings,
} from "@shared/types";

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

export function createAccount(token: string, account: Omit<Account, "id">) {
  return requestApi<Account>(token, "/api/accounts", {
    method: "POST",
    ...body(account),
  });
}

export function updateAccount(
  token: string,
  accountId: string,
  account: Omit<Account, "id">,
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
  record: Omit<WalletRecord, "id">,
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
  category: Omit<Category, "id">,
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

export function createTag(token: string, tag: Omit<Tag, "id">) {
  return requestApi<Tag>(token, "/api/tags", {
    method: "POST",
    ...body(tag),
  });
}

export function updateTag(token: string, tagId: string, tag: Omit<Tag, "id">) {
  return requestApi<Tag>(token, `/api/tags/${tagId}`, {
    method: "PATCH",
    ...body(tag),
  });
}

export function deleteTag(token: string, tagId: string) {
  return requestApi<{ deleted: true }>(token, `/api/tags/${tagId}`, {
    method: "DELETE",
  });
}

export function createGoal(token: string, goal: Omit<Goal, "id">) {
  return requestApi<Goal>(token, "/api/goals", {
    method: "POST",
    ...body(goal),
  });
}

export function updateGoal(token: string, goalId: string, goal: Omit<Goal, "id">) {
  return requestApi<Goal>(token, `/api/goals/${goalId}`, {
    method: "PATCH",
    ...body(goal),
  });
}

export function deleteGoal(token: string, goalId: string) {
  return requestApi<{ deleted: true }>(token, `/api/goals/${goalId}`, {
    method: "DELETE",
  });
}

export function createGoalReservation(
  token: string,
  reservation: Omit<GoalReservation, "id">,
) {
  return requestApi<GoalReservation>(token, "/api/goal-reservations", {
    method: "POST",
    ...body(reservation),
  });
}

export function createInvestment(
  token: string,
  investment: Omit<Investment, "id">,
) {
  return requestApi<Investment>(token, "/api/investments", {
    method: "POST",
    ...body(investment),
  });
}

export function updateInvestment(
  token: string,
  investmentId: string,
  investment: Omit<Investment, "id">,
) {
  return requestApi<Investment>(token, `/api/investments/${investmentId}`, {
    method: "PATCH",
    ...body(investment),
  });
}

export function deleteInvestment(token: string, investmentId: string) {
  return requestApi<{ deleted: true }>(token, `/api/investments/${investmentId}`, {
    method: "DELETE",
  });
}

export function updateSettings(token: string, settings: WalletSettings) {
  return requestApi<WalletSettings>(token, "/api/settings", {
    method: "PUT",
    ...body(settings),
  });
}
