import type { VercelRequest, VercelResponse } from "@vercel/node";
import { debtSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import { deleteDebt, updateDebt } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Debt id is required");
    return;
  }

  try {
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
  } catch (error) {
    routeError(res, error);
  }
}
