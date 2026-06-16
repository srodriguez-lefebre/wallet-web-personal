import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError, type ZodSchema } from "zod";
import { sendError } from "./response";

export function parseBody(req: VercelRequest) {
  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  return req.body ?? {};
}

export function validateBody<T>(req: VercelRequest, schema: ZodSchema<T>) {
  return schema.parse(parseBody(req));
}

export function routeError(res: VercelResponse, error: unknown) {
  if (error instanceof SyntaxError) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    return;
  }

  if (error instanceof ZodError) {
    sendError(res, 400, "VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid body");
    return;
  }

  console.error(error);
  sendError(res, 500, "INTERNAL_ERROR", "Unexpected server error");
}
