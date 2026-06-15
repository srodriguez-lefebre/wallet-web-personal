import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireApiToken } from "./auth";
import { requireMethod } from "./method";

export function guardApi(
  req: VercelRequest,
  res: VercelResponse,
  methods: string[],
) {
  return requireMethod(req, res, methods) && requireApiToken(req, res);
}
