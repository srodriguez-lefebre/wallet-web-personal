import type { VercelRequest, VercelResponse } from "@vercel/node";
import { recordSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData } from "../../server/api/response.js";
import { createRecord, listRecords } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "POST") {
      sendData(res, await createRecord(validateBody(req, recordSchema)), 201);
      return;
    }

    sendData(res, await listRecords({
      type: typeof req.query.type === "string" ? req.query.type : undefined,
      accountId:
        typeof req.query.accountId === "string" ? req.query.accountId : undefined,
      categoryId:
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined,
    }));
  } catch (error) {
    routeError(res, error);
  }
}
