import type { ApiErrorCode } from "./response.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly publicMessage: string,
    options?: ErrorOptions,
  ) {
    super(publicMessage, options);
  }
}

export const validationError = (message = "Invalid request") =>
  new HttpError(400, "VALIDATION_ERROR", message);
export const notFoundError = (resource: string) =>
  new HttpError(404, "NOT_FOUND", `${resource} not found`);
export const conflictError = (message: string) =>
  new HttpError(409, "CONFLICT", message);
export const referenceNotFoundError = (message = "Referenced resource not found") =>
  new HttpError(422, "REFERENCE_NOT_FOUND", message);

function databaseDetails(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint === "string" ? candidate.constraint : undefined,
      };
    }
    current = candidate.cause;
  }
  return {};
}

export function translateDatabaseError(error: unknown, operation: "write" | "delete" = "write") {
  const details = databaseDetails(error);
  if (details.code === "23505") return conflictError("A resource with those values already exists");
  if (details.code === "23503") {
    return operation === "delete"
      ? conflictError("The resource is still referenced")
      : referenceNotFoundError();
  }
  if (details.code === "22P02") return validationError("Invalid identifier");
  return null;
}
