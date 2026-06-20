import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { ZodError, type ZodSchema } from "zod";
import { uuidSchema } from "../../shared/schemas.js";
import { HttpError, translateDatabaseError } from "./errors.js";
import { sendError } from "./response.js";

export function parseBody(req: VercelRequest) {
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

export function routeError(res: VercelResponse, error: unknown) {
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.publicMessage);
    return;
  }
  if (error instanceof SyntaxError) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    return;
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    sendError(res, 400, "VALIDATION_ERROR", `${path}${issue?.message ?? "Invalid request"}`);
    return;
  }
  const databaseError = translateDatabaseError(error);
  if (databaseError) {
    sendError(res, databaseError.status, databaseError.code, databaseError.publicMessage);
    return;
  }
  const requestId = randomUUID();
  console.error("Unexpected API error", { requestId, error });
  res.setHeader("X-Request-Id", requestId);
  sendError(res, 500, "INTERNAL_ERROR", "Unexpected server error");
}
