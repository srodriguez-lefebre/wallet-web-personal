import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildDueRecurringDebtInstances } from "../../shared/calculations.js";
import { guardApi } from "../../server/api/guard.js";
import { routeError } from "../../server/api/request.js";
import { sendData } from "../../server/api/response.js";
import {
  createDebts,
  getWalletDataset,
} from "../../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["POST"])) return;

  try {
    const dataset = await getWalletDataset();
    const dueDebts = buildDueRecurringDebtInstances(dataset);
    sendData(res, await createDebts(dueDebts), 201);
  } catch (error) {
    routeError(res, error);
  }
}
