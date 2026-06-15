import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendData } from "../server/api/response";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  sendData(res, {
    ok: true,
    service: "wallet-web-personal",
  });
}
