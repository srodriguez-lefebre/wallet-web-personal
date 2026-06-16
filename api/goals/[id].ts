import type { VercelRequest, VercelResponse } from "@vercel/node";
import { goalSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import { deleteGoal, updateGoal } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Goal id is required");
    return;
  }

  try {
    if (req.method === "PATCH") {
      const goal = await updateGoal(id, validateBody(req, goalSchema));
      if (!goal) {
        sendError(res, 404, "NOT_FOUND", "Goal not found");
        return;
      }
      sendData(res, goal);
      return;
    }

    if (!(await deleteGoal(id))) {
      sendError(res, 404, "NOT_FOUND", "Goal not found");
      return;
    }
    sendData(res, { deleted: true });
  } catch (error) {
    routeError(res, error);
  }
}
