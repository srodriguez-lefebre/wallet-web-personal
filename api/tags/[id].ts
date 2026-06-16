import type { VercelRequest, VercelResponse } from "@vercel/node";
import { tagSchema } from "@shared/schemas";
import { guardApi } from "../../server/api/guard";
import { routeError, validateBody } from "../../server/api/request";
import { sendData, sendError } from "../../server/api/response";
import { deleteTag, updateTag } from "../../server/db/wallet-repository";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["PATCH", "DELETE"])) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    sendError(res, 400, "VALIDATION_ERROR", "Tag id is required");
    return;
  }

  try {
    if (req.method === "PATCH") {
      const tag = await updateTag(id, validateBody(req, tagSchema));
      if (!tag) {
        sendError(res, 404, "NOT_FOUND", "Tag not found");
        return;
      }
      sendData(res, tag);
      return;
    }

    if (!(await deleteTag(id))) {
      sendError(res, 404, "NOT_FOUND", "Tag not found");
      return;
    }
    sendData(res, { deleted: true });
  } catch (error) {
    routeError(res, error);
  }
}
