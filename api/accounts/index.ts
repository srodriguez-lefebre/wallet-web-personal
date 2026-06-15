import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mockWalletData } from "@shared/mock-data";
import { guardApi } from "../../server/api/guard";
import { sendData } from "../../server/api/response";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET"])) return;
  sendData(res, mockWalletData.accounts);
}
