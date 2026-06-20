import type { VercelResponse } from "@vercel/node";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REFERENCE_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "TOO_MANY_REQUESTS"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiError {
  message: string;
  code: ApiErrorCode;
}

export function sendData<T>(res: VercelResponse, data: T, status = 200) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ data, error: null });
}

export function sendError(
  res: VercelResponse,
  status: number,
  code: ApiErrorCode,
  message: string,
) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({
    data: null,
    error: {
      code,
      message,
    },
  });
}
