import type { VercelRequest, VercelResponse } from "@vercel/node";
import { categorySchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import { deleteCategory, updateCategory } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Category id is required");
    return;
  }

  try {
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
  } catch (error) {
    routeError(res, error);
  }
}
