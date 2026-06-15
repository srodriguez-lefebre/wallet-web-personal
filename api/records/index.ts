import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mockWalletData } from "@shared/mock-data";
import { guardApi } from "../../server/api/guard";
import { sendData } from "../../server/api/response";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET"])) return;

  const type = typeof req.query.type === "string" ? req.query.type : null;
  const records = type
    ? mockWalletData.records.filter((record) => record.type === type)
    : mockWalletData.records;

  sendData(res, records);
}
