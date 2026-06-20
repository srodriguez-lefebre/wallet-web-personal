import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  accountSchema,
  categorySchema,
  creditCardPaymentSchema,
  creditCardSchema,
  debtPaymentSchema,
  debtSchema,
  recordSchema,
  recurringDebtSchema,
  settingsSchema,
  unlockSchema,
} from "../shared/schemas.js";
import {
  buildDueRecurringDebtInstances,
  calculateCreditCardSummary,
} from "../shared/calculations.js";
import { isValidApiToken } from "../server/api/auth.js";
import { guardApi } from "../server/api/guard.js";
import { requireMethod } from "../server/api/method.js";
import { routeError, validateBody } from "../server/api/request.js";
import { sendData, sendError } from "../server/api/response.js";
import {
  createAccount,
  createCategory,
  createCreditCard,
  createCreditCardPayment,
  createDebt,
  createDebts,
  createRecord,
  createRecurringDebt,
  listDebts,
  deleteAccount,
  deleteCategory,
  archiveCreditCard,
  deleteDebt,
  deleteRecord,
  deleteRecurringDebt,
  getSettings,
  getWalletDataset,
  listAccounts,
  listCategories,
  listCreditCards,
  listRecords,
  listRecurringDebts,
  recordDebtPayment,
  updateAccount,
  updateCategory,
  updateCreditCard,
  updateDebt,
  updateRecord,
  updateRecurringDebt,
  upsertSettings,
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

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const account = await updateAccount(id, validateBody(req, accountSchema));
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
      sendData(res, await createCategory(validateBody(req, categorySchema)), 201);
      return;
    }
    sendData(res, await listCategories());
    return;
  }

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const category = await updateCategory(id, validateBody(req, categorySchema));
    if (!category) {
      sendError(res, 404, "NOT_FOUND", "Category not found");
      return;
    }
    sendData(res, category);
    return;
  }

  await deleteCategory(id);
  sendData(res, { deleted: true });
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
    sendData(
      res,
      await listRecords({
        type: typeof req.query.type === "string" ? req.query.type : undefined,
        accountId:
          typeof req.query.accountId === "string"
            ? req.query.accountId
            : undefined,
        creditCardId:
          typeof req.query.creditCardId === "string"
            ? req.query.creditCardId
            : undefined,
        categoryId:
          typeof req.query.categoryId === "string"
            ? req.query.categoryId
            : undefined,
      }),
    );
    return;
  }

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const record = await updateRecord(id, validateBody(req, recordSchema));
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

async function handleCards(
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
) {
  const id = segments[1];
  if (!id) {
    if (!guardApi(req, res, ["GET", "POST"])) return;
    if (req.method === "POST") {
      sendData(res, await createCreditCard(validateBody(req, creditCardSchema)), 201);
      return;
    }
    sendData(res, await listCreditCards());
    return;
  }

  if (segments[2] === "payments") {
    if (!guardApi(req, res, ["POST"])) return;
    const cards = await listCreditCards();
    if (!cards.some((card) => card.id === id)) {
      sendError(res, 404, "NOT_FOUND", "Credit card not found");
      return;
    }
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
    if (!guardApi(req, res, ["GET"])) return;
    sendData(res, await listRecords({ creditCardId: id }));
    return;
  }

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const card = await updateCreditCard(id, validateBody(req, creditCardSchema));
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
  // /api/debts/generate-recurring
  if (segments.length === 2 && segments[1] === "generate-recurring") {
    if (!guardApi(req, res, ["POST"])) return;
    const dataset = await getWalletDataset();
    const dueDebts = buildDueRecurringDebtInstances(dataset);
    sendData(res, await createDebts(dueDebts), 201);
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
    try {
      const result = await recordDebtPayment(
        id,
        validateBody(req, debtPaymentSchema),
      );
      if (!result) {
        sendError(res, 404, "NOT_FOUND", "Debt not found");
        return;
      }
      sendData(res, result, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Invalid debt payment amount"
      ) {
        sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Payment amount is invalid for this debt",
        );
        return;
      }
      throw error;
    }
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

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const debt = await updateDebt(id, validateBody(req, debtSchema));
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

  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;
  if (req.method === "PATCH") {
    const recurringDebt = await updateRecurringDebt(
      id,
      validateBody(req, recurringDebtSchema),
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

function handleAuth(
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
) {
  if (segments[1] !== "unlock") {
    sendError(res, 404, "NOT_FOUND", "Not found");
    return;
  }
  if (!requireMethod(req, res, ["POST"])) return;

  const parsed = unlockSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Token is required");
    return;
  }
  if (!isValidApiToken(parsed.data.token)) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid token");
    return;
  }
  sendData(res, { valid: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = pathSegments(req);
  const [resource] = segments;

  try {
    switch (resource) {
      case "health":
        if (!guardApi(req, res, ["GET"])) return;
        sendData(res, { ok: true, service: "wallet-web-personal" });
        return;
      case "wallet":
        if (!guardApi(req, res, ["GET"])) return;
        sendData(res, await getWalletDataset());
        return;
      case "settings":
        if (!guardApi(req, res, ["GET", "PUT"])) return;
        if (req.method === "PUT") {
          sendData(res, await upsertSettings(validateBody(req, settingsSchema)));
          return;
        }
        sendData(res, await getSettings());
        return;
      case "auth":
        handleAuth(req, res, segments);
        return;
      case "accounts":
        await handleAccounts(req, res, segments[1]);
        return;
      case "categories":
        await handleCategories(req, res, segments[1]);
        return;
      case "records":
        await handleRecords(req, res, segments[1]);
        return;
      case "cards":
        await handleCards(req, res, segments);
        return;
      case "debts":
        await handleDebts(req, res, segments);
        return;
      case "recurring-debts":
        await handleRecurringDebts(req, res, segments[1]);
        return;
      default:
        sendError(res, 404, "NOT_FOUND", "Not found");
        return;
    }
  } catch (error) {
    routeError(res, error);
  }
}
