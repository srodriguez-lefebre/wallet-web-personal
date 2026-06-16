import type { VercelRequest, VercelResponse } from "@vercel/node";
import { goalSchema } from "@shared/schemas";
import { guardApi } from "../../server/api/guard";
import { routeError, validateBody } from "../../server/api/request";
import { sendData, sendError } from "../../server/api/response";
import { deleteGoal, updateGoal } from "../../server/db/wallet-repository";

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
