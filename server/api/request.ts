import { randomUUID } from "node:crypto";

import { ZodError, type ZodSchema } from "zod";

import { uuidSchema } from "../../shared/schemas.js";
import { publicErrorMetadata } from "./context.js";
import { HttpError, translateDatabaseError } from "./errors.js";
import { sendError } from "./response.js";

import type { VercelRequest, VercelResponse } from "@vercel/node";

export function parseBody(req: VercelRequest): unknown {
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  return req.body ?? {};
}

export function validateBody<T>(req: VercelRequest, schema: ZodSchema<T>) {
  return schema.parse(parseBody(req));
}

export function validatePathId(value: string | undefined) {
  return uuidSchema.parse(value);
}

export function validateQuery<T>(req: VercelRequest, schema: ZodSchema<T>) {
  return schema.parse(req.query);
}

export function routeError(
  res: VercelResponse,
  error: unknown,
  options: { requestId?: string; log?: boolean } = {},
) {
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.publicMessage);
    return error.status;
  }
  if (error instanceof SyntaxError) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    return 400;
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    sendError(res, 400, "VALIDATION_ERROR", `${path}${issue?.message ?? "Invalid request"}`);
    return 400;
  }
  const databaseError = translateDatabaseError(error);
  if (databaseError) {
    sendError(res, databaseError.status, databaseError.code, databaseError.publicMessage);
    return databaseError.status;
  }
  const requestId = options.requestId ?? randomUUID();
  if (options.log !== false)
    console.error(JSON.stringify({ requestId, ...publicErrorMetadata(error) }));
  res.setHeader("X-Request-Id", requestId);
  sendError(res, 500, "INTERNAL_ERROR", "Unexpected server error");
  return 500;
}
