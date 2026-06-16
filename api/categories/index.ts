import type { VercelRequest, VercelResponse } from "@vercel/node";
import { categorySchema } from "@shared/schemas";
import { guardApi } from "../../server/api/guard";
import { routeError, validateBody } from "../../server/api/request";
import { sendData } from "../../server/api/response";
import { createCategory, listCategories } from "../../server/db/wallet-repository";

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
