import type { VercelRequest, VercelResponse } from "@vercel/node";
import { calculateSummary } from "@shared/calculations";
import { mockWalletData } from "@shared/mock-data";
import { guardApi } from "../../server/api/guard";
import { sendData } from "../../server/api/response";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET"])) return;

  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  sendData(res, calculateSummary(mockWalletData, month));
}
