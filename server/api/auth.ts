import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./response";

export function extractBearerToken(req: VercelRequest) {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export function isValidApiToken(token: string | null) {
  const expected = process.env.API_TOKEN;
  return Boolean(expected && token && token === expected);
}

export function requireApiToken(req: VercelRequest, res: VercelResponse) {
  if (!isValidApiToken(extractBearerToken(req))) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or missing token");
    return false;
  }

  return true;
}
