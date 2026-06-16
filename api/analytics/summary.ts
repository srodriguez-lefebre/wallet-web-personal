import type { VercelRequest, VercelResponse } from "@vercel/node";
import { calculateSummary } from "../../shared/calculations.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError } from "../../server/api/request.js";
import { sendData } from "../../server/api/response.js";
import { getWalletDataset } from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET"])) return;

  try {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    sendData(res, calculateSummary(await getWalletDataset(), month));
  } catch (error) {
    routeError(res, error);
  }
}
