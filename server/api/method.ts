import { sendError } from "./response.js";

import type { VercelRequest, VercelResponse } from "@vercel/node";

export function requireMethod(req: VercelRequest, res: VercelResponse, allowed: string[]) {
  if (!req.method || !allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return false;
  }

  return true;
}
