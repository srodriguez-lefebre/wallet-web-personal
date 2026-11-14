import { pgErrorDetails } from "../db/pg-error.js";

import type { ApiErrorCode } from "./response.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export const validationError = (message = "Invalid request") =>
  new HttpError(400, "VALIDATION_ERROR", message);
export const notFoundError = (resource: string) =>
  new HttpError(404, "NOT_FOUND", `${resource} not found`);
export const conflictError = (message: string) => new HttpError(409, "CONFLICT", message);
export const referenceNotFoundError = (message = "Referenced resource not found") =>
  new HttpError(422, "REFERENCE_NOT_FOUND", message);

export function translateDatabaseError(error: unknown, operation: "write" | "delete" = "write") {
  const details = pgErrorDetails(error);
  if (details.code === "23505") return conflictError("A resource with those values already exists");
  if (details.code === "23503") {
    return operation === "delete"
      ? conflictError("The resource is still referenced")
      : referenceNotFoundError();
  }
  if (details.code === "22P02") return validationError("Invalid identifier");
  if (details.code === "23514")
    return validationError(
      "La operación no respeta las monedas o los importes del historial financiero",
    );
  if (details.code === "22012")
    return conflictError(
      "The financial mutation exceeds the available balance or its processing claim has expired",
    );
  return null;
}
