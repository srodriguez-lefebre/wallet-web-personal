import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guardApi } from "../server/api/guard.js";
import { routeError } from "../server/api/request.js";
import { sendData } from "../server/api/response.js";
import { getWalletDataset } from "../server/db/wallet-repository.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET"])) return;

  try {
    sendData(res, await getWalletDataset());
  } catch (error) {
    routeError(res, error);
  }
}
