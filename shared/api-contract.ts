import { z, type ZodType } from "zod";
import {
  accountPatchSchema, accountSchema, categoryPatchSchema, categorySchema,
  creditCardPatchSchema, creditCardPaymentSchema, creditCardRecordPatchSchema,
  creditCardRecordSchema, creditCardSchema, debtPatchSchema, debtPaymentSchema,
  debtSchema, mailIngestionSchema, recordFiltersSchema, recordPatchSchema,
  recordSchema, recurringDebtPatchSchema, recurringDebtSchema, settingsPatchSchema,
  settingsSchema, unlockSchema, uuidSchema, walletBootstrapSchema,
  tagSchema, tagPatchSchema, goalSchema, goalPatchSchema, goalReservationSchema,
  budgetSchema, budgetPatchSchema, investmentSchema, investmentPatchSchema,
  installmentPlanSchema, installmentPlanPatchSchema,
  recordImportSchema,
} from "./schemas.js";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ApiAuth = "none" | "session" | "ingest";

export interface ApiOperation {
  operationId: string;
  method: ApiMethod;
  path: string;
  auth: ApiAuth;
  stability: "stable" | "experimental" | "deprecated";
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  response: ZodType;
  successStatus: number;
  errors: number[];
  summary: string;
}

const anyResponse = z.unknown();
const idParams = z.object({ id: uuidSchema });
const cardRecordParams = z.object({ id: uuidSchema, recordId: uuidSchema });
const cardPaymentParams = z.object({ id: uuidSchema, paymentId: uuidSchema });
const cardStatementParams = z.object({ id: uuidSchema, statementId: uuidSchema });

const op = (definition: ApiOperation) => definition;

export const apiOperations = [
  op({ operationId: "auth.unlock", method: "POST", path: "/api/auth/unlock", auth: "none", stability: "stable", body: unlockSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 429, 500], summary: "Unlock the wallet and issue a signed session" }),
  op({ operationId: "health.get", method: "GET", path: "/api/health", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "Authenticated service health" }),
  op({ operationId: "wallet.get", method: "GET", path: "/api/wallet", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "Legacy full wallet snapshot" }),
  op({ operationId: "wallet.bootstrap", method: "POST", path: "/api/wallet/bootstrap", auth: "session", stability: "stable", body: walletBootstrapSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 500], summary: "Generate recurring debts and load a paginated snapshot" }),
  op({ operationId: "settings.get", method: "GET", path: "/api/settings", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "Get settings" }),
  op({ operationId: "settings.replace", method: "PUT", path: "/api/settings", auth: "session", stability: "stable", body: settingsSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 422, 500], summary: "Replace settings" }),
  op({ operationId: "settings.patch", method: "PATCH", path: "/api/settings", auth: "session", stability: "stable", body: settingsPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 422, 500], summary: "Update selected settings" }),
  op({ operationId: "ingest.mailTransaction", method: "POST", path: "/api/ingest/mail/transactions", auth: "ingest", stability: "stable", body: mailIngestionSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500, 503], summary: "Ingest a parsed Gmail transaction" }),

  op({ operationId: "accounts.list", method: "GET", path: "/api/accounts", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List accounts" }),
  op({ operationId: "accounts.create", method: "POST", path: "/api/accounts", auth: "session", stability: "stable", body: accountSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create an account" }),
  op({ operationId: "accounts.patch", method: "PATCH", path: "/api/accounts/{id}", auth: "session", stability: "stable", params: idParams, body: accountPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update an account" }),
  op({ operationId: "accounts.delete", method: "DELETE", path: "/api/accounts/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Archive an account while preserving history" }),

  op({ operationId: "categories.list", method: "GET", path: "/api/categories", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List active categories" }),
  op({ operationId: "categories.create", method: "POST", path: "/api/categories", auth: "session", stability: "stable", body: categorySchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a category" }),
  op({ operationId: "categories.patch", method: "PATCH", path: "/api/categories/{id}", auth: "session", stability: "stable", params: idParams, body: categoryPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update a category" }),
  op({ operationId: "categories.delete", method: "DELETE", path: "/api/categories/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Archive a category tree and reassign references" }),

  op({ operationId: "records.list", method: "GET", path: "/api/records", auth: "session", stability: "stable", query: recordFiltersSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 500], summary: "List a keyset-paginated record page" }),
  op({ operationId: "records.create", method: "POST", path: "/api/records", auth: "session", stability: "stable", body: recordSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a wallet record" }),
  op({ operationId: "records.patch", method: "PATCH", path: "/api/records/{id}", auth: "session", stability: "stable", params: idParams, body: recordPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update a wallet record" }),
  op({ operationId: "records.delete", method: "DELETE", path: "/api/records/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Soft-delete a record" }),
  op({ operationId: "records.import", method: "POST", path: "/api/records/import", auth: "session", stability: "stable", body: recordImportSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Atomically import up to 200 validated records" }),

  op({ operationId: "cards.list", method: "GET", path: "/api/cards", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List credit cards" }),
  op({ operationId: "cards.create", method: "POST", path: "/api/cards", auth: "session", stability: "stable", body: creditCardSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a credit card" }),
  op({ operationId: "cards.patch", method: "PATCH", path: "/api/cards/{id}", auth: "session", stability: "stable", params: idParams, body: creditCardPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update a credit card" }),
  op({ operationId: "cards.delete", method: "DELETE", path: "/api/cards/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Archive a credit card" }),
  op({ operationId: "cards.summary", method: "GET", path: "/api/cards/{id}/summary", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Get credit-card cycle summary" }),
  op({ operationId: "cardRecords.list", method: "GET", path: "/api/cards/{id}/records", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 500], summary: "List card-local movements" }),
  op({ operationId: "cardRecords.create", method: "POST", path: "/api/cards/{id}/records", auth: "session", stability: "stable", params: idParams, body: creditCardRecordSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a card-local movement" }),
  op({ operationId: "cardRecords.patch", method: "PATCH", path: "/api/cards/{id}/records/{recordId}", auth: "session", stability: "stable", params: cardRecordParams, body: creditCardRecordPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update a card-local movement" }),
  op({ operationId: "cardRecords.delete", method: "DELETE", path: "/api/cards/{id}/records/{recordId}", auth: "session", stability: "stable", params: cardRecordParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Soft-delete a card-local movement" }),
  op({ operationId: "cardRecords.refund", method: "POST", path: "/api/cards/{id}/refunds", auth: "session", stability: "stable", params: idParams, body: creditCardRecordSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a refund linked to an original movement" }),
  op({ operationId: "cardPayments.create", method: "POST", path: "/api/cards/{id}/payments", auth: "session", stability: "stable", params: idParams, body: creditCardPaymentSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Register a credit-card payment" }),
  op({ operationId: "cardPayments.delete", method: "DELETE", path: "/api/cards/{id}/payments/{paymentId}", auth: "session", stability: "stable", params: cardPaymentParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete a credit-card payment" }),
  op({ operationId: "cardStatements.list", method: "GET", path: "/api/cards/{id}/statements", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 500], summary: "List closed card statements" }),
  op({ operationId: "cardStatements.pay", method: "POST", path: "/api/cards/{id}/statements/{statementId}/payments", auth: "session", stability: "stable", params: cardStatementParams, body: creditCardPaymentSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 404, 409, 422, 500], summary: "Pay a card statement" }),

  op({ operationId: "debts.list", method: "GET", path: "/api/debts", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List debts" }),
  op({ operationId: "debts.create", method: "POST", path: "/api/debts", auth: "session", stability: "stable", body: debtSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a debt" }),
  op({ operationId: "debts.patch", method: "PATCH", path: "/api/debts/{id}", auth: "session", stability: "stable", params: idParams, body: debtPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update a debt" }),
  op({ operationId: "debts.delete", method: "DELETE", path: "/api/debts/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete a debt" }),
  op({ operationId: "debts.pay", method: "POST", path: "/api/debts/{id}/payments", auth: "session", stability: "stable", params: idParams, body: debtPaymentSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 404, 409, 422, 500], summary: "Atomically apply an idempotent debt payment" }),
  op({ operationId: "debts.generateRecurring", method: "POST", path: "/api/debts/generate-recurring", auth: "session", stability: "stable", response: anyResponse, successStatus: 201, errors: [401, 500], summary: "Generate due recurring-debt instances idempotently" }),
  op({ operationId: "recurringDebts.list", method: "GET", path: "/api/recurring-debts", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List recurring-debt rules" }),
  op({ operationId: "recurringDebts.create", method: "POST", path: "/api/recurring-debts", auth: "session", stability: "stable", body: recurringDebtSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 422, 500], summary: "Create a recurring-debt rule" }),
  op({ operationId: "recurringDebts.patch", method: "PATCH", path: "/api/recurring-debts/{id}", auth: "session", stability: "stable", params: idParams, body: recurringDebtPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 422, 500], summary: "Update a recurring-debt rule" }),
  op({ operationId: "recurringDebts.delete", method: "DELETE", path: "/api/recurring-debts/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete a recurring-debt rule" }),
  op({ operationId: "tags.list", method: "GET", path: "/api/tags", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List tags" }),
  op({ operationId: "tags.create", method: "POST", path: "/api/tags", auth: "session", stability: "stable", body: tagSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 500], summary: "Create a tag" }),
  op({ operationId: "tags.patch", method: "PATCH", path: "/api/tags/{id}", auth: "session", stability: "stable", params: idParams, body: tagPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Update a tag" }),
  op({ operationId: "tags.delete", method: "DELETE", path: "/api/tags/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete a tag and detach its references" }),
  op({ operationId: "goals.list", method: "GET", path: "/api/goals", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List goals" }),
  op({ operationId: "goals.create", method: "POST", path: "/api/goals", auth: "session", stability: "stable", body: goalSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 500], summary: "Create a goal atomically with its tags" }),
  op({ operationId: "goals.patch", method: "PATCH", path: "/api/goals/{id}", auth: "session", stability: "stable", params: idParams, body: goalPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Update a goal" }),
  op({ operationId: "goals.delete", method: "DELETE", path: "/api/goals/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Archive a goal" }),
  op({ operationId: "goalReservations.list", method: "GET", path: "/api/goal-reservations", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List goal reservations" }),
  op({ operationId: "goalReservations.create", method: "POST", path: "/api/goal-reservations", auth: "session", stability: "stable", body: goalReservationSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 500], summary: "Reserve account funds for a goal" }),
  op({ operationId: "goalReservations.delete", method: "DELETE", path: "/api/goal-reservations/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Release a goal reservation" }),
  op({ operationId: "budgets.list", method: "GET", path: "/api/budgets", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List budgets" }),
  op({ operationId: "budgets.create", method: "POST", path: "/api/budgets", auth: "session", stability: "stable", body: budgetSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 500], summary: "Create a budget" }),
  op({ operationId: "budgets.patch", method: "PATCH", path: "/api/budgets/{id}", auth: "session", stability: "stable", params: idParams, body: budgetPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Update a budget" }),
  op({ operationId: "budgets.delete", method: "DELETE", path: "/api/budgets/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete a budget" }),
  op({ operationId: "investments.list", method: "GET", path: "/api/investments", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List investments" }),
  op({ operationId: "investments.create", method: "POST", path: "/api/investments", auth: "session", stability: "stable", body: investmentSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 500], summary: "Create an investment" }),
  op({ operationId: "investments.patch", method: "PATCH", path: "/api/investments/{id}", auth: "session", stability: "stable", params: idParams, body: investmentPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Update an investment" }),
  op({ operationId: "investments.delete", method: "DELETE", path: "/api/investments/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete an investment" }),
  op({ operationId: "installmentPlans.list", method: "GET", path: "/api/installment-plans", auth: "session", stability: "stable", response: anyResponse, successStatus: 200, errors: [401, 500], summary: "List installment plans" }),
  op({ operationId: "installmentPlans.create", method: "POST", path: "/api/installment-plans", auth: "session", stability: "stable", body: installmentPlanSchema, response: anyResponse, successStatus: 201, errors: [400, 401, 409, 500], summary: "Create an installment plan" }),
  op({ operationId: "installmentPlans.patch", method: "PATCH", path: "/api/installment-plans/{id}", auth: "session", stability: "stable", params: idParams, body: installmentPlanPatchSchema, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 409, 500], summary: "Update an installment plan" }),
  op({ operationId: "installmentPlans.delete", method: "DELETE", path: "/api/installment-plans/{id}", auth: "session", stability: "stable", params: idParams, response: anyResponse, successStatus: 200, errors: [400, 401, 404, 500], summary: "Delete an installment plan" }),
] as const satisfies readonly ApiOperation[];

export type ApiOperationId = (typeof apiOperations)[number]["operationId"];
export type UnlockRequest = z.infer<typeof unlockSchema>;
export interface UnlockResult { token: string; expiresAt: string }

export function findApiOperation(method: string | undefined, path: string) {
  return apiOperations.find((operation) => {
    if (operation.method !== method) return false;
    const pattern = operation.path.replace(/\{[^/]+\}/g, "[^/]+");
    return new RegExp(`^${pattern}$`).test(path);
  });
}
