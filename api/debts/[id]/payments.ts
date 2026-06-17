import type { VercelRequest, VercelResponse } from "@vercel/node";
import { debtPaymentSchema } from "../../../shared/schemas.js";
import { guardApi } from "../../../server/api/guard.js";
import { routeError, validateBody } from "../../../server/api/request.js";
import { sendData, sendError } from "../../../server/api/response.js";
import { recordDebtPayment } from "../../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["POST"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
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

    routeError(res, error);
  }
}
