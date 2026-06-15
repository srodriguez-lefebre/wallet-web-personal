import type { VercelRequest, VercelResponse } from "@vercel/node";
import { unlockSchema } from "@shared/schemas";
import { isValidApiToken } from "../../server/api/auth";
import { requireMethod } from "../../server/api/method";
import { sendData, sendError } from "../../server/api/response";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ["POST"])) return;

  const parsed = unlockSchema.safeParse(req.body);

  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Token is required");
    return;
  }

  if (!isValidApiToken(parsed.data.token)) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid token");
    return;
  }

  sendData(res, { valid: true });
}
