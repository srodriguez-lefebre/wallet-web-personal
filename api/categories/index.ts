import type { VercelRequest, VercelResponse } from "@vercel/node";
import { categorySchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData } from "../../server/api/response.js";
import { createCategory, listCategories } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "POST") {
      sendData(res, await createCategory(validateBody(req, categorySchema)), 201);
      return;
    }

    sendData(res, await listCategories());
  } catch (error) {
    routeError(res, error);
  }
}
