import type { VercelRequest, VercelResponse } from "@vercel/node";
import { recurringDebtSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import {
  deleteRecurringDebt,
  updateRecurringDebt,
} from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Recurring debt id is required");
    return;
  }

  try {
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
  } catch (error) {
    routeError(res, error);
  }
}
