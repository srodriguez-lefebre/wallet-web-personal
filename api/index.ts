import type { VercelRequest, VercelResponse } from "@vercel/node";
import { findApiOperation } from "../shared/api-contract.js";
import {
  accountSchema,
  accountPatchSchema,
  categorySchema,
  categoryPatchSchema,
  creditCardPaymentSchema,
  creditCardRecordSchema,
  creditCardRecordPatchSchema,
  creditCardSchema,
  creditCardPatchSchema,
  debtPaymentSchema,
  debtSchema,
  debtPatchSchema,
  recordSchema,
  recordPatchSchema,
  recurringDebtSchema,
  recurringDebtPatchSchema,
  settingsSchema,
  settingsPatchSchema,
  unlockSchema,
  mailIngestionSchema,
  recordFiltersSchema,
  walletBootstrapSchema,
  tagSchema,
  tagPatchSchema,
  goalSchema,
  goalPatchSchema,
  goalReservationSchema,
  budgetSchema,
  budgetPatchSchema,
  investmentSchema,
  investmentPatchSchema,
  installmentPlanSchema,
  installmentPlanPatchSchema,
  recordImportSchema,
} from "../shared/schemas.js";
import {
  calculateCreditCardSummary,
} from "../shared/calculations.js";
import { createSessionToken, isValidApiToken, requireIngestToken } from "../server/api/auth.js";
import { assertUnlockAllowed, clearUnlockFailures, registerUnlockFailure } from "../server/api/rate-limit.js";
import { guardApi } from "../server/api/guard.js";
import { requireMethod } from "../server/api/method.js";
import { routeError, validateBody, validatePathId, validateQuery } from "../server/api/request.js";
import { sendData, sendError } from "../server/api/response.js";
import {
  IngestionInProgressError,
  processMailIngestion,
} from "../server/ingestion/process-mail-ingestion.js";
import {
  createAccount,
  createCategory,
  createCreditCard,
  createCreditCardPayment,
  createCreditCardRecord,
  createDebt,
  createRecord,
  createRecurringDebt,
  listDebts,
  deleteAccount,
  deleteCategory,
  archiveCreditCard,
  deleteDebt,
  deleteRecord,
  deleteCreditCardRecord,
  deleteCreditCardPayment,
  deleteRecurringDebt,
  getSettings,
  getWalletDataset,
  bootstrapWallet,
  generateDueRecurringDebts,
  listAccounts,
  listCategories,
  listCreditCards,
  listCreditCardRecords,
  listCreditCardStatements,
  listRecords,
  listRecurringDebts,
  recordDebtPayment,
  updateAccount,
  updateCategory,
  updateCreditCard,
  updateCreditCardRecord,
  updateDebt,
  updateRecord,
  updateRecurringDebt,
  upsertSettings,
  patchSettings,
  payCreditCardStatement,
  listTags, createTag, updateTag, deleteTag,
  listGoals, createGoal, updateGoal, deleteGoal,
  listGoalReservations, createGoalReservation, deleteGoalReservation,
  listBudgets, createBudget, updateBudget, deleteBudget,
  listInvestments, createInvestment, updateInvestment, deleteInvestment,
  listInstallmentPlans, createInstallmentPlan, updateInstallmentPlan, deleteInstallmentPlan,
  createRecordsBulk,
} from "../server/db/wallet-repository.js";

// Single router Serverless Function. Vercel's Hobby plan caps a deployment at
// 12 functions, so vercel.json rewrites every `/api/*` request here and the
// original path is dispatched below.
function pathSegments(req: VercelRequest) {
  const rewrittenPath = req.query.path;
  if (rewrittenPath) {
    const path = Array.isArray(rewrittenPath)
      ? rewrittenPath.join("/")
      : rewrittenPath;
    return path.split("/").filter(Boolean);
  }

  const pathname = (req.url ?? "").split("?")[0];
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "api") segments.shift();
  return segments;
}

async function handleAccounts(
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createAccount(validateBody(req, accountSchema)), 201);
      return;
    }
    sendData(res, await listAccounts());
    return;
  }
  id = validatePathId(id);

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const account = await updateAccount(id, validateBody(req, accountPatchSchema));
    if (!account) {
      sendError(res, 404, "NOT_FOUND", "Account not found");
      return;
    }
    sendData(res, account);
    return;
  }

  if (!(await deleteAccount(id))) {
    sendError(res, 404, "NOT_FOUND", "Account not found");
    return;
  }
  sendData(res, { deleted: true });
}

async function handleCategories(
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(
        res,
        await createCategory(validateBody(req, categorySchema)),
        201,
      );
      return;
    }
    sendData(res, await listCategories());
    return;
  }
  id = validatePathId(id);

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const category = await updateCategory(
      id,
      validateBody(req, categoryPatchSchema),
    );
    if (!category) {
      sendError(res, 404, "NOT_FOUND", "Category not found");
      return;
    }
    sendData(res, category);
    return;
  }

  const result = await deleteCategory(id);
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
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createRecord(validateBody(req, recordSchema)), 201);
      return;
    }
    sendData(res, await listRecords(validateQuery(req, recordFiltersSchema)));
    return;
  }
  id = validatePathId(id);

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const record = await updateRecord(id, validateBody(req, recordPatchSchema));
    if (!record) {
      sendError(res, 404, "NOT_FOUND", "Record not found");
      return;
    }
    sendData(res, record);
    return;
  }

  if (!(await deleteRecord(id))) {
    sendError(res, 404, "NOT_FOUND", "Record not found");
    return;
  }
  sendData(res, { deleted: true });
}

async function handleRecordImport(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["POST"])) return;
  const input = validateBody(req, recordImportSchema);
  sendData(res, await createRecordsBulk(input.records), 201);
}

async function handleCards(
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
    (segments[2] === "statements" && (segments.length === 3 || (segments.length === 5 && segments[4] === "payments")));
  if (!validShape) {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  const id = segments[1];
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(
        res,
        await createCreditCard(validateBody(req, creditCardSchema)),
        201,
      );
      return;
    }
    sendData(res, await listCreditCards());
    return;
  }
  validatePathId(id);

  if (segments[2] === "payments" && segments[3]) {
    validatePathId(segments[3]);
    if (!guardApi(req, res, ["DELETE"])) return;
    if (!(await deleteCreditCardPayment(id, segments[3]))) {
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
      await createCreditCardPayment(
        id,
        validateBody(req, creditCardPaymentSchema),
      ),
      201,
    );
    return;
  }

  if (segments[2] === "summary") {
    if (!guardApi(req, res, ["GET"])) return;
    const dataset = await getWalletDataset();
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
          await createCreditCardRecord(
            id,
            validateBody(req, creditCardRecordSchema),
          ),
          201,
        );
      else sendData(res, await listCreditCardRecords(id));
      return;
    }
    validatePathId(recordId);
    if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
    if (req.method === "PATCH") {
      const movement = await updateCreditCardRecord(
        id,
        recordId,
        validateBody(req, creditCardRecordPatchSchema),
      );
      if (!movement)
        sendError(res, 404, "NOT_FOUND", "Card movement not found");
      else sendData(res, movement);
      return;
    }
    if (!(await deleteCreditCardRecord(id, recordId)))
      sendError(res, 404, "NOT_FOUND", "Card movement not found");
    else sendData(res, { deleted: true });
    return;
  }

  if (segments[2] === "refunds") {
    if (!guardApi(req, res, ["POST"])) return;
    const input = validateBody(req, creditCardRecordSchema);
    sendData(
      res,
      await createCreditCardRecord(id, { ...input, kind: "refund" }),
      201,
    );
    return;
  }

  if (segments[2] === "statements") {
    const statementId = segments[3];
    if (!statementId) {
      if (!guardApi(req, res, ["GET"])) return;
      sendData(res, await listCreditCardStatements(id));
      return;
    }
    validatePathId(statementId);
    if (segments[4] === "payments") {
      if (!guardApi(req, res, ["POST"])) return;
      sendData(
        res,
        await payCreditCardStatement(
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
    const card = await updateCreditCard(
      id,
      validateBody(req, creditCardPatchSchema),
    );
    if (!card) {
      sendError(res, 404, "NOT_FOUND", "Credit card not found");
      return;
    }
    sendData(res, card);
    return;
  }

  if (!(await archiveCreditCard(id))) {
    sendError(res, 404, "NOT_FOUND", "Credit card not found");
    return;
  }
  sendData(res, { deleted: true });
}

async function handleDebts(
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
) {
  const validShape =
    segments.length <= 2 ||
    (segments.length === 3 && segments[2] === "payments");
  if (!validShape) {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  // /api/debts/generate-recurring
  if (segments.length === 2 && segments[1] === "generate-recurring") {
    if (!guardApi(req, res, ["POST"])) return;
    sendData(res, await generateDueRecurringDebts(), 201);
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
    const result = await recordDebtPayment(
      id,
      validateBody(req, debtPaymentSchema),
    );
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
      sendData(res, await createDebt(validateBody(req, debtSchema)), 201);
      return;
    }
    sendData(res, await listDebts());
    return;
  }
  validatePathId(id);

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const debt = await updateDebt(id, validateBody(req, debtPatchSchema));
    if (!debt) {
      sendError(res, 404, "NOT_FOUND", "Debt not found");
      return;
    }
    sendData(res, debt);
    return;
  }

  if (!(await deleteDebt(id))) {
    sendError(res, 404, "NOT_FOUND", "Debt not found");
    return;
  }
  sendData(res, { deleted: true });
}

async function handleRecurringDebts(
  req: VercelRequest,
  res: VercelResponse,
  id: string | undefined,
) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(
        res,
        await createRecurringDebt(validateBody(req, recurringDebtSchema)),
        201,
      );
      return;
    }
    sendData(res, await listRecurringDebts());
    return;
  }
  id = validatePathId(id);

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const recurringDebt = await updateRecurringDebt(
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

  if (!(await deleteRecurringDebt(id))) {
    sendError(res, 404, "NOT_FOUND", "Recurring debt not found");
    return;
  }
  sendData(res, { deleted: true });
}

async function handleTags(req: VercelRequest, res: VercelResponse, id?: string) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") sendData(res, await createTag(validateBody(req, tagSchema)), 201);
    else sendData(res, await listTags());
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateTag(id, validateBody(req, tagPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Tag not found"); else sendData(res, result);
  } else if (!(await deleteTag(id))) sendError(res, 404, "NOT_FOUND", "Tag not found");
  else sendData(res, { deleted: true });
}

async function handleGoals(req: VercelRequest, res: VercelResponse, id?: string) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") sendData(res, await createGoal(validateBody(req, goalSchema)), 201);
    else sendData(res, await listGoals());
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateGoal(id, validateBody(req, goalPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Goal not found"); else sendData(res, result);
  } else if (!(await deleteGoal(id))) sendError(res, 404, "NOT_FOUND", "Goal not found");
  else sendData(res, { deleted: true });
}

async function handleGoalReservations(req: VercelRequest, res: VercelResponse, id?: string) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") sendData(res, await createGoalReservation(validateBody(req, goalReservationSchema)), 201);
    else sendData(res, await listGoalReservations());
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["DELETE"])) return;
  if (!(await deleteGoalReservation(id))) sendError(res, 404, "NOT_FOUND", "Reservation not found");
  else sendData(res, { deleted: true });
}

async function handleBudgets(req: VercelRequest, res: VercelResponse, id?: string) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") sendData(res, await createBudget(validateBody(req, budgetSchema)), 201);
    else sendData(res, await listBudgets());
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateBudget(id, validateBody(req, budgetPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Budget not found"); else sendData(res, result);
  } else if (!(await deleteBudget(id))) sendError(res, 404, "NOT_FOUND", "Budget not found");
  else sendData(res, { deleted: true });
}

async function handleInvestments(req: VercelRequest, res: VercelResponse, id?: string) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") sendData(res, await createInvestment(validateBody(req, investmentSchema)), 201);
    else sendData(res, await listInvestments());
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateInvestment(id, validateBody(req, investmentPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Investment not found"); else sendData(res, result);
  } else if (!(await deleteInvestment(id))) sendError(res, 404, "NOT_FOUND", "Investment not found");
  else sendData(res, { deleted: true });
}

async function handleInstallmentPlans(req: VercelRequest, res: VercelResponse, id?: string) {
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") sendData(res, await createInstallmentPlan(validateBody(req, installmentPlanSchema)), 201);
    else sendData(res, await listInstallmentPlans());
    return;
  }
  id = validatePathId(id);
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const result = await updateInstallmentPlan(id, validateBody(req, installmentPlanPatchSchema));
    if (!result) sendError(res, 404, "NOT_FOUND", "Installment plan not found"); else sendData(res, result);
  } else if (!(await deleteInstallmentPlan(id))) sendError(res, 404, "NOT_FOUND", "Installment plan not found");
  else sendData(res, { deleted: true });
}

async function handleAuth(
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
  const limit = await assertUnlockAllowed(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    sendError(res, 429, "TOO_MANY_REQUESTS", "Too many unlock attempts");
    return;
  }
  const parsed = validateBody(req, unlockSchema);
  if (!isValidApiToken(parsed.token)) {
    await registerUnlockFailure(limit.key);
    sendError(res, 401, "UNAUTHORIZED", "Invalid token");
    return;
  }
  await clearUnlockFailures(limit.key);
  sendData(res, createSessionToken());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = pathSegments(req);
  const [resource] = segments;
  const operation = findApiOperation(req.method, `/api/${segments.join("/")}`);
  if (operation) res.setHeader("X-Operation-Id", operation.operationId);
  const clientOperationId = req.headers["x-client-operation-id"];
  if (operation && typeof clientOperationId === "string" && clientOperationId !== operation.operationId) {
    sendError(res, 400, "CONTRACT_MISMATCH", "Client operation does not match request route");
    return;
  }

  try {
    switch (resource) {
      case "health":
        if (segments.length !== 1) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        if (!guardApi(req, res, ["GET"])) return;
        sendData(res, { ok: true, service: "wallet-web-personal" });
        return;
      case "wallet":
        if (segments.length === 2 && segments[1] === "bootstrap") {
          if (!guardApi(req, res, ["POST"])) return;
          const startedAt = performance.now();
          const result = await bootstrapWallet(validateBody(req, walletBootstrapSchema));
          const duration = performance.now() - startedAt;
          res.setHeader("Server-Timing", `bootstrap;dur=${duration.toFixed(1)}`);
          console.info(JSON.stringify({ event: "wallet_bootstrap", durationMs: Math.round(duration), records: result.dataset.records.length, hasMore: result.recordsPage.hasMore, generatedDebts: result.generatedDebts.length }));
          sendData(res, result);
          return;
        }
        if (segments.length !== 1) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        if (!guardApi(req, res, ["GET"])) return;
        sendData(res, await getWalletDataset());
        return;
      case "settings":
        if (segments.length !== 1) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        if (!guardApi(req, res, ["GET", "PUT", "PATCH"])) return;
        if (req.method === "PUT") {
          sendData(
            res,
            await upsertSettings(validateBody(req, settingsSchema)),
          );
          return;
        }
        if (req.method === "PATCH") {
          sendData(res, await patchSettings(validateBody(req, settingsPatchSchema)));
          return;
        }
        sendData(res, await getSettings());
        return;
      case "auth":
        await handleAuth(req, res, segments);
        return;
      case "ingest":
        if (segments[1] !== "mail" || segments[2] !== "transactions") {
          sendError(res, 404, "NOT_FOUND", "Not found");
          return;
        }
        if (!requireMethod(req, res, ["POST"]) || !requireIngestToken(req, res))
          return;
        {
          const result = await processMailIngestion(
            validateBody(req, mailIngestionSchema),
          );
          sendData(
            res,
            result,
            result.status === "created" || result.status === "needs_review"
              ? 201
              : 200,
          );
        }
        return;
      case "accounts":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleAccounts(req, res, segments[1]);
        return;
      case "categories":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleCategories(req, res, segments[1]);
        return;
      case "records":
        if (segments.length === 2 && segments[1] === "import") { await handleRecordImport(req, res); return; }
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleRecords(req, res, segments[1]);
        return;
      case "cards":
        await handleCards(req, res, segments);
        return;
      case "debts":
        await handleDebts(req, res, segments);
        return;
      case "recurring-debts":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleRecurringDebts(req, res, segments[1]);
        return;
      case "tags":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleTags(req, res, segments[1]);
        return;
      case "goals":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleGoals(req, res, segments[1]);
        return;
      case "goal-reservations":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleGoalReservations(req, res, segments[1]);
        return;
      case "budgets":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleBudgets(req, res, segments[1]);
        return;
      case "investments":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleInvestments(req, res, segments[1]);
        return;
      case "installment-plans":
        if (segments.length > 2) { sendError(res, 404, "NOT_FOUND", "Not found"); return; }
        await handleInstallmentPlans(req, res, segments[1]);
        return;
      default:
        sendError(res, 404, "NOT_FOUND", "Not found");
        return;
    }
  } catch (error) {
    if (error instanceof IngestionInProgressError) {
      sendError(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "Ingestion is still processing; retry later",
      );
      return;
    }
    routeError(res, error);
  }
}
