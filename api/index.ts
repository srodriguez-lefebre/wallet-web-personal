import { createSessionToken, isValidApiToken, requireIngestToken } from "../server/api/auth.js";
import { guardApi } from "../server/api/guard.js";
import { requireMethod } from "../server/api/method.js";
import {
  assertUnlockAllowed,
  clearUnlockFailures,
  registerUnlockFailure,
} from "../server/api/rate-limit.js";
import { routeError, validateBody, validatePathId, validateQuery } from "../server/api/request.js";
import { sendData, sendError } from "../server/api/response.js";
import { createDb, type DbClient } from "../server/db/client.js";
import {
  archiveCreditCard,
  bootstrapWallet,
  createAccount,
  createBudget,
  createCategory,
  createCreditCard,
  createCreditCardPayment,
  createCreditCardRecord,
  createDebt,
  createGoal,
  createGoalReservation,
  createInstallmentPlan,
  createInvestment,
  createRecord,
  createRecordTemplate,
  createRecurringDebt,
  createTag,
  deleteAccount,
  deleteBudget,
  deleteCategory,
  deleteCreditCardPayment,
  deleteCreditCardRecord,
  deleteDebt,
  deleteGoal,
  deleteGoalReservation,
  deleteInstallmentPlan,
  deleteInvestment,
  deleteRecord,
  deleteRecordTemplate,
  deleteRecurringDebt,
  deleteTag,
  generateDueRecurringDebts,
  getSettings,
  getWalletBackup,
  getWalletDataset,
  listAccounts,
  listBudgets,
  listCategories,
  listCreditCardRecords,
  listCreditCards,
  listCreditCardStatements,
  listDebts,
  listGoalReservations,
  listGoals,
  listInstallmentPlans,
  listInvestments,
  listRecords,
  listRecordTemplates,
  listRecurringDebts,
  listTags,
  patchSettings,
  payCreditCardStatement,
  recordDebtPayment,
  releaseGoalReservation,
  updateAccount,
  updateBudget,
  updateCategory,
  updateCreditCard,
  updateCreditCardRecord,
  updateDebt,
  updateGoal,
  updateInstallmentPlan,
  updateInvestment,
  updateRecord,
  updateRecordTemplate,
  updateRecurringDebt,
  updateTag,
  upsertSettings,
} from "../server/db/index.js";
import { importWalletRecords } from "../server/db/record-import.js";
import { restoreWalletBackup } from "../server/db/wallet-restore.js";
import {
  IngestionInProgressError,
  processMailIngestion,
} from "../server/ingestion/process-mail-ingestion.js";
import { findApiOperation } from "../shared/api-contract.js";
import { calculateCreditCardSummary } from "../shared/calculations.js";
import {
  accountPatchSchema,
  accountSchema,
  budgetPatchSchema,
  budgetSchema,
  categoryPatchSchema,
  categorySchema,
  creditCardPatchSchema,
  creditCardPaymentSchema,
  creditCardRecordPatchSchema,
  creditCardRecordSchema,
  creditCardSchema,
  debtPatchSchema,
  debtPaymentSchema,
  debtSchema,
  goalPatchSchema,
  goalReservationReleaseSchema,
  goalReservationSchema,
  goalSchema,
  installmentPlanPatchSchema,
  installmentPlanSchema,
  investmentPatchSchema,
  investmentSchema,
  mailIngestionSchema,
  recordCreateSchema,
  recordFiltersSchema,
  recordImportSchema,
  recordPatchSchema,
  recordTemplatePatchSchema,
  recordTemplateSchema,
  recurringDebtPatchSchema,
  recurringDebtSchema,
  settingsPatchSchema,
  settingsSchema,
  tagPatchSchema,
  tagSchema,
  unlockSchema,
  walletBackupSchema,
  walletBootstrapSchema,
} from "../shared/schemas.js";

import type { VercelRequest, VercelResponse } from "@vercel/node";
// Single router Serverless Function. Vercel's Hobby plan caps a deployment at
// 12 functions, so vercel.json rewrites every `/api/*` request here and the
// original path is dispatched below.
function pathSegments(req: VercelRequest) {
  const rewrittenPath = req.query.path;
  if (rewrittenPath) {
    const path = Array.isArray(rewrittenPath) ? rewrittenPath.join("/") : rewrittenPath;
    return path.split("/").filter(Boolean);
  }
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "api") segments.shift();
  return segments;
}
async function handleAccounts(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createAccount(getDb(), validateBody(req, accountSchema)), 201);
      return;
    }
    sendData(res, await listAccounts(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const account = await updateAccount(getDb(), id, validateBody(req, accountPatchSchema));
    if (!account) {
      sendError(res, 404, "NOT_FOUND", "Account not found");
      return;
    }
    sendData(res, account);
    return;
  }
  if (!(await deleteAccount(getDb(), id))) {
    sendError(res, 404, "NOT_FOUND", "Account not found");
    return;
  }
  sendData(res, { deleted: true });
}
async function handleCategories(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createCategory(getDb(), validateBody(req, categorySchema)), 201);
      return;
    }
    sendData(res, await listCategories(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const category = await updateCategory(getDb(), id, validateBody(req, categoryPatchSchema));
    if (!category) {
      sendError(res, 404, "NOT_FOUND", "Category not found");
      return;
    }
    sendData(res, category);
    return;
  }
  const result = await deleteCategory(getDb(), id);
  if (!result.deleted && result.reason === "not_found") {
    sendError(res, 404, "NOT_FOUND", "Category not found");
    return;
  }
  if (!result.deleted) {
    sendError(res, 409, "CONFLICT", "Protected categories cannot be deleted");
    return;
  }
  sendData(res, result);
}
async function handleRecords(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createRecord(getDb(), validateBody(req, recordCreateSchema)), 201);
      return;
    }
    sendData(res, await listRecords(getDb(), validateQuery(req, recordFiltersSchema)));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const record = await updateRecord(getDb(), id, validateBody(req, recordPatchSchema));
    if (!record) {
      sendError(res, 404, "NOT_FOUND", "Record not found");
      return;
    }
    sendData(res, record);
    return;
  }
  if (!(await deleteRecord(getDb(), id))) {
    sendError(res, 404, "NOT_FOUND", "Record not found");
    return;
  }
  sendData(res, { deleted: true });
}
async function handleRecordImport(getDb: () => DbClient, req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["POST"])) return;
  const input = validateBody(req, recordImportSchema);
  sendData(res, await importWalletRecords(getDb(), input.records), 201);
}
async function handleCards(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
) {
  const validShape =
    segments.length <= 2 ||
    (segments[2] === "summary" && segments.length === 3) ||
    (segments[2] === "payments" && (segments.length === 3 || segments.length === 4)) ||
    (segments[2] === "records" && (segments.length === 3 || segments.length === 4)) ||
    (segments[2] === "refunds" && segments.length === 3) ||
    (segments[2] === "statements" &&
      (segments.length === 3 || (segments.length === 5 && segments[4] === "payments")));
  if (!validShape) {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  const id = segments[1];
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createCreditCard(getDb(), validateBody(req, creditCardSchema)), 201);
      return;
    }
    sendData(res, await listCreditCards(getDb()));
    return;
  }
  validatePathId(id);
  if (segments[2] === "payments" && segments[3]) {
    validatePathId(segments[3]);
    if (!guardApi(req, res, ["DELETE"])) return;
    if (!(await deleteCreditCardPayment(getDb(), id, segments[3]))) {
      sendError(res, 404, "NOT_FOUND", "Payment not found");
      return;
    }
    sendData(res, { deleted: true });
    return;
  }
  if (segments[2] === "payments") {
    if (!guardApi(req, res, ["POST"])) return;
    sendData(
      res,
      await createCreditCardPayment(getDb(), id, validateBody(req, creditCardPaymentSchema)),
      201,
    );
    return;
  }
  if (segments[2] === "summary") {
    if (!guardApi(req, res, ["GET"])) return;
    const dataset = await getWalletDataset(getDb());
    const card = dataset.creditCards.find((item) => item.id === id);
    if (!card) {
      sendError(res, 404, "NOT_FOUND", "Credit card not found");
      return;
    }
    sendData(res, calculateCreditCardSummary(dataset, card));
    return;
  }
  if (segments[2] === "records") {
    const recordId = segments[3];
    if (!recordId) {
      if (!guardApi(req, res, ["GET", "POST"])) return;
      if (req.method === "POST")
        sendData(
          res,
          await createCreditCardRecord(getDb(), id, validateBody(req, creditCardRecordSchema)),
          201,
        );
      else sendData(res, await listCreditCardRecords(getDb(), id));
      return;
    }
    validatePathId(recordId);
    if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
    if (req.method === "PATCH") {
      const movement = await updateCreditCardRecord(
        getDb(),
        id,
        recordId,
        validateBody(req, creditCardRecordPatchSchema),
      );
      if (!movement) sendError(res, 404, "NOT_FOUND", "Card movement not found");
      else sendData(res, movement);
      return;
    }
    if (!(await deleteCreditCardRecord(getDb(), id, recordId)))
      sendError(res, 404, "NOT_FOUND", "Card movement not found");
    else sendData(res, { deleted: true });
    return;
  }
  if (segments[2] === "refunds") {
    if (!guardApi(req, res, ["POST"])) return;
    const input = validateBody(req, creditCardRecordSchema);
    sendData(res, await createCreditCardRecord(getDb(), id, { ...input, kind: "refund" }), 201);
    return;
  }
  if (segments[2] === "statements") {
    const statementId = segments[3];
    if (!statementId) {
      if (!guardApi(req, res, ["GET"])) return;
      sendData(res, await listCreditCardStatements(getDb(), id));
      return;
    }
    validatePathId(statementId);
    if (segments[4] === "payments") {
      if (!guardApi(req, res, ["POST"])) return;
      sendData(
        res,
        await payCreditCardStatement(
          getDb(),
          id,
          statementId,
          validateBody(req, creditCardPaymentSchema),
        ),
        201,
      );
      return;
    }
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const card = await updateCreditCard(getDb(), id, validateBody(req, creditCardPatchSchema));
    if (!card) {
      sendError(res, 404, "NOT_FOUND", "Credit card not found");
      return;
    }
    sendData(res, card);
    return;
  }
  if (!(await archiveCreditCard(getDb(), id))) {
    sendError(res, 404, "NOT_FOUND", "Credit card not found");
    return;
  }
  sendData(res, { deleted: true });
}
async function handleDebts(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
) {
  const validShape = segments.length <= 2 || (segments.length === 3 && segments[2] === "payments");
  if (!validShape) {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  // /api/debts/generate-recurring
  if (segments.length === 2 && segments[1] === "generate-recurring") {
    if (!guardApi(req, res, ["POST"])) return;
    sendData(res, await generateDueRecurringDebts(getDb()), 201);
    return;
  }
  // /api/debts/:id/payments
  if (segments.length === 3 && segments[2] === "payments") {
    if (!guardApi(req, res, ["POST"])) return;
    const id = segments[1];
    if (!id) {
      sendError(res, 400, "VALIDATION_ERROR", "Debt id is required");
      return;
    }
    validatePathId(id);
    const result = await recordDebtPayment(getDb(), id, validateBody(req, debtPaymentSchema));
    if (!result) {
      sendError(res, 404, "NOT_FOUND", "Debt not found");
      return;
    }
    sendData(res, result, 201);
    return;
  }
  const id = segments[1];
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createDebt(getDb(), validateBody(req, debtSchema)), 201);
      return;
    }
    sendData(res, await listDebts(getDb()));
    return;
  }
  validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const debt = await updateDebt(getDb(), id, validateBody(req, debtPatchSchema));
    if (!debt) {
      sendError(res, 404, "NOT_FOUND", "Debt not found");
      return;
    }
    sendData(res, debt);
    return;
  }
  if (!(await deleteDebt(getDb(), id))) {
    sendError(res, 404, "NOT_FOUND", "Debt not found");
    return;
  }
  sendData(res, { deleted: true });
}
async function handleRecurringDebts(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(
        res,
        await createRecurringDebt(getDb(), validateBody(req, recurringDebtSchema)),
        201,
      );
      return;
    }
    sendData(res, await listRecurringDebts(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const recurringDebt = await updateRecurringDebt(
      getDb(),
      id,
      validateBody(req, recurringDebtPatchSchema),
    );
    if (!recurringDebt) {
      sendError(res, 404, "NOT_FOUND", "Recurring debt not found");
      return;
    }
    sendData(res, recurringDebt);
    return;
  }
  if (!(await deleteRecurringDebt(getDb(), id))) {
    sendError(res, 404, "NOT_FOUND", "Recurring debt not found");
    return;
  }
  sendData(res, { deleted: true });
}
async function handleRecordTemplates(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(
        res,
        await createRecordTemplate(getDb(), validateBody(req, recordTemplateSchema)),
        201,
      );
    else sendData(res, await listRecordTemplates(getDb()));
    return;
  }
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  id = validatePathId(id);
  if (req.method === "PATCH") {
    const template = await updateRecordTemplate(
      getDb(),
      id,
      validateBody(req, recordTemplatePatchSchema),
    );
    if (!template) sendError(res, 404, "NOT_FOUND", "Template not found");
    else sendData(res, template);
  } else if (!(await deleteRecordTemplate(getDb(), id)))
    sendError(res, 404, "NOT_FOUND", "Template not found");
  else sendData(res, { deleted: true });
}
async function handleTags(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(res, await createTag(getDb(), validateBody(req, tagSchema)), 201);
    else sendData(res, await listTags(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateTag(getDb(), id, validateBody(req, tagPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Tag not found");
    else sendData(res, result);
  } else if (!(await deleteTag(getDb(), id))) sendError(res, 404, "NOT_FOUND", "Tag not found");
  else sendData(res, { deleted: true });
}
async function handleGoals(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(res, await createGoal(getDb(), validateBody(req, goalSchema)), 201);
    else sendData(res, await listGoals(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateGoal(getDb(), id, validateBody(req, goalPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Goal not found");
    else sendData(res, result);
  } else if (!(await deleteGoal(getDb(), id))) sendError(res, 404, "NOT_FOUND", "Goal not found");
  else sendData(res, { deleted: true });
}
async function handleGoalReservations(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (id === "release") {
    if (!guardApi(req, res, ["POST"])) return;
    sendData(
      res,
      await releaseGoalReservation(getDb(), validateBody(req, goalReservationReleaseSchema)),
      201,
    );
    return;
  }
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(
        res,
        await createGoalReservation(getDb(), validateBody(req, goalReservationSchema)),
        201,
      );
    else sendData(res, await listGoalReservations(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["DELETE"])) return;
  if (!(await deleteGoalReservation(getDb(), id)))
    sendError(res, 404, "NOT_FOUND", "Reservation not found");
  else sendData(res, { deleted: true });
}
async function handleBudgets(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(res, await createBudget(getDb(), validateBody(req, budgetSchema)), 201);
    else sendData(res, await listBudgets(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateBudget(getDb(), id, validateBody(req, budgetPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Budget not found");
    else sendData(res, result);
  } else if (!(await deleteBudget(getDb(), id)))
    sendError(res, 404, "NOT_FOUND", "Budget not found");
  else sendData(res, { deleted: true });
}
async function handleInvestments(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(res, await createInvestment(getDb(), validateBody(req, investmentSchema)), 201);
    else sendData(res, await listInvestments(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateInvestment(getDb(), id, validateBody(req, investmentPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Investment not found");
    else sendData(res, result);
  } else if (!(await deleteInvestment(getDb(), id)))
    sendError(res, 404, "NOT_FOUND", "Investment not found");
  else sendData(res, { deleted: true });
}
async function handleInstallmentPlans(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  id?: string,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST")
      sendData(
        res,
        await createInstallmentPlan(getDb(), validateBody(req, installmentPlanSchema)),
        201,
      );
    else sendData(res, await listInstallmentPlans(getDb()));
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateInstallmentPlan(
      getDb(),
      id,
      validateBody(req, installmentPlanPatchSchema),
    );
    if (!result) sendError(res, 404, "NOT_FOUND", "Installment plan not found");
    else sendData(res, result);
  } else if (!(await deleteInstallmentPlan(getDb(), id)))
    sendError(res, 404, "NOT_FOUND", "Installment plan not found");
  else sendData(res, { deleted: true });
}
async function handleAuth(
  getDb: () => DbClient,
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
) {
  if (segments[1] !== "unlock") {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  if (segments.length !== 2) {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  if (!requireMethod(req, res, ["POST"])) return;
  const parsed = validateBody(req, unlockSchema);
  const limit = await assertUnlockAllowed(getDb(), req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    sendError(res, 429, "TOO_MANY_REQUESTS", "Too many unlock attempts");
    return;
  }
  if (!isValidApiToken(parsed.token)) {
    await registerUnlockFailure(getDb(), limit.key);
    sendError(res, 401, "UNAUTHORIZED", "Invalid token");
    return;
  }
  await clearUnlockFailures(getDb(), limit.key);
  sendData(res, createSessionToken());
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let requestDb: DbClient | undefined;
  const getDb = () => (requestDb ??= createDb());
  const segments = pathSegments(req);
  const [resource] = segments;
  const operation = findApiOperation(req.method, `/api/${segments.join("/")}`);
  if (operation) res.setHeader("X-Operation-Id", operation.operationId);
  const clientOperationId = req.headers["x-client-operation-id"];
  if (
    operation &&
    typeof clientOperationId === "string" &&
    clientOperationId !== operation.operationId
  ) {
    sendError(res, 400, "CONTRACT_MISMATCH", "Client operation does not match request route");
    return;
  }
  try {
    switch (resource) {
      case "health":
        if (segments.length !== 1) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        if (!guardApi(req, res, ["GET"])) return;
        sendData(res, { ok: true, service: "wallet-web-personal" });
        return;
      case "wallet":
        if (segments.length === 2 && segments[1] === "backup") {
          if (!guardApi(req, res, ["GET"])) return;
          sendData(res, await getWalletBackup(getDb()));
          return;
        }
        if (segments.length === 2 && segments[1] === "restore") {
          if (!guardApi(req, res, ["POST"])) return;
          sendData(res, await restoreWalletBackup(getDb(), validateBody(req, walletBackupSchema)));
          return;
        }
        if (segments.length === 2 && segments[1] === "bootstrap") {
          if (!guardApi(req, res, ["POST"])) return;
          const startedAt = performance.now();
          const result = await bootstrapWallet(getDb(), validateBody(req, walletBootstrapSchema));
          const duration = performance.now() - startedAt;
          res.setHeader("Server-Timing", `bootstrap;dur=${duration.toFixed(1)}`);
          console.info(
            JSON.stringify({
              event: "wallet_bootstrap",
              durationMs: Math.round(duration),
              records: result.dataset.records.length,
              hasMore: result.recordsPage.hasMore,
              generatedDebts: result.generatedDebts.length,
            }),
          );
          sendData(res, result);
          return;
        }
        if (segments.length !== 1) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        if (!guardApi(req, res, ["GET"])) return;
        sendData(res, await getWalletDataset(getDb()));
        return;
      case "settings":
        if (segments.length !== 1) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        if (!guardApi(req, res, ["GET", "PUT", "PATCH"])) return;
        if (req.method === "PUT") {
          sendData(res, await upsertSettings(getDb(), validateBody(req, settingsSchema)));
          return;
        }
        if (req.method === "PATCH") {
          sendData(res, await patchSettings(getDb(), validateBody(req, settingsPatchSchema)));
          return;
        }
        sendData(res, await getSettings(getDb()));
        return;
      case "auth":
        await handleAuth(getDb, req, res, segments);
        return;
      case "ingest":
        if (segments[1] !== "mail" || segments[2] !== "transactions") {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        if (!requireMethod(req, res, ["POST"]) || !requireIngestToken(req, res)) return;
        {
          const result = await processMailIngestion(
            getDb(),
            validateBody(req, mailIngestionSchema),
          );
          sendData(
            res,
            result,
            result.status === "created" || result.status === "needs_review" ? 201 : 200,
          );
        }
        return;
      case "accounts":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleAccounts(getDb, req, res, segments[1]);
        return;
      case "categories":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleCategories(getDb, req, res, segments[1]);
        return;
      case "records":
        if (segments.length === 2 && segments[1] === "import") {
          await handleRecordImport(getDb, req, res);
          return;
        }
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleRecords(getDb, req, res, segments[1]);
        return;
      case "cards":
        await handleCards(getDb, req, res, segments);
        return;
      case "debts":
        await handleDebts(getDb, req, res, segments);
        return;
      case "recurring-debts":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleRecurringDebts(getDb, req, res, segments[1]);
        return;
      case "tags":
      case "record-templates":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        if (resource === "record-templates")
          await handleRecordTemplates(getDb, req, res, segments[1]);
        else await handleTags(getDb, req, res, segments[1]);
        return;
      case "goals":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleGoals(getDb, req, res, segments[1]);
        return;
      case "goal-reservations":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleGoalReservations(getDb, req, res, segments[1]);
        return;
      case "budgets":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleBudgets(getDb, req, res, segments[1]);
        return;
      case "investments":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleInvestments(getDb, req, res, segments[1]);
        return;
      case "installment-plans":
        if (segments.length > 2) {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        await handleInstallmentPlans(getDb, req, res, segments[1]);
        return;
      default:
        sendError(res, 404, "NOT_FOUND", "Not found");
        return;
    }
  } catch (error) {
    if (error instanceof IngestionInProgressError) {
      sendError(res, 503, "SERVICE_UNAVAILABLE", "Ingestion is still processing; retry later");
      return;
    }
    routeError(res, error);
  }
}
