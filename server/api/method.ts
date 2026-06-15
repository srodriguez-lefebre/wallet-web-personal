import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./response";

export function requireMethod(
  req: VercelRequest,
  res: VercelResponse,
  allowed: string[],
) {
  if (!req.method || !allowed.includes(req.method)) {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return false;
  }

  return true;
}
