import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guardApi } from "../server/api/guard.js";
import { sendData } from "../server/api/response.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET"])) return;

  sendData(res, {
    ok: true,
    service: "wallet-web-personal",
  });
}
