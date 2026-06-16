import type { VercelRequest, VercelResponse } from "@vercel/node";
import { accountSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import { deleteAccount, updateAccount } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Account id is required");
    return;
  }

  try {
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
  } catch (error) {
    routeError(res, error);
  }
}
