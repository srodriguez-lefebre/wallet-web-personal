import { randomUUID } from "node:crypto";

import { createDb, type DbClient } from "../db/client.js";
import { pgErrorDetails } from "../db/pg-error.js";

import type { ApiOperationId } from "../../shared/api-contract.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export function publicErrorMetadata(error: unknown) {
  if (!(error instanceof Error)) return { name: "Error", message: "Unexpected error" };
  const seen = new Set<object>();
  let cause: unknown = error;
  let database = Boolean(pgErrorDetails(error).code);
  while (cause && typeof cause === "object" && !seen.has(cause)) {
    seen.add(cause);
    const value = cause as { query?: unknown; params?: unknown; cause?: unknown };
    database ||= "query" in value || "params" in value;
    cause = value.cause;
  }
  return { name: error.name, message: database ? "Database request failed" : error.message };
}
export function createRequestContext(req: VercelRequest, res: VercelResponse) {
  let db: DbClient | undefined;
  const startedAt = performance.now();
  const requestId = randomUUID();
  const ctx = {
    req,
    now: new Date(),
    requestId,
    operationId: undefined as ApiOperationId | undefined,
    successStatus: undefined as number | undefined,
    get db() {
      return (db ??= createDb());
    },
    setHeader: (name: string, value: string) => res.setHeader(name, value),
    log(status: number, error?: unknown) {
      console.info(
        JSON.stringify({
          requestId,
          method: req.method ?? null,
          operation: ctx.operationId ?? null,
          status,
          durationMs: Math.round(performance.now() - startedAt),
          ...(status >= 500 && error ? { error: publicErrorMetadata(error) } : {}),
        }),
      );
    },
  };
  res.setHeader("X-Request-Id", requestId);
  return ctx;
}
export type RequestContext = ReturnType<typeof createRequestContext>;
