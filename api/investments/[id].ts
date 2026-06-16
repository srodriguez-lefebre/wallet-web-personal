import type { VercelRequest, VercelResponse } from "@vercel/node";
import { investmentSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import {
  deleteInvestment,
  updateInvestment,
} from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Investment id is required");
    return;
  }

  try {
    if (req.method === "PATCH") {
      const investment = await updateInvestment(
        id,
        validateBody(req, investmentSchema),
      );
      if (!investment) {
        sendError(res, 404, "NOT_FOUND", "Investment not found");
        return;
      }
      sendData(res, investment);
      return;
    }

    if (!(await deleteInvestment(id))) {
      sendError(res, 404, "NOT_FOUND", "Investment not found");
      return;
    }
    sendData(res, { deleted: true });
  } catch (error) {
    routeError(res, error);
  }
}
