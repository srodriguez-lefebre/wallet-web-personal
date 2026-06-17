import type { VercelRequest, VercelResponse } from "@vercel/node";
import { debtSchema } from "../../shared/schemas.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError, validateBody } from "../../server/api/request.js";
import { sendData } from "../../server/api/response.js";
import { createDebt, listDebts } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "POST") {
      sendData(res, await createDebt(validateBody(req, debtSchema)), 201);
      return;
    }

    sendData(res, await listDebts());
  } catch (error) {
    routeError(res, error);
  }
}
