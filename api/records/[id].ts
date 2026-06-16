import type { VercelRequest, VercelResponse } from "@vercel/node";
import { recordSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData, sendError } from "../../server/api/response.js";
import { deleteRecord, updateRecord } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Record id is required");
    return;
  }

  try {
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
  } catch (error) {
    routeError(res, error);
  }
}
