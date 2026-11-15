import { z, type ZodType } from "zod";
import { apiOperations } from "@shared/api-contract";

import type { ApiOperation, ApiOperationId, OperationResponse } from "@shared/api-contract";

type Field<Op, Key extends PropertyKey> =
  Op extends Record<Key, ZodType>
    ? (Key extends "query" ? Record<never, never> : undefined) extends z.input<Op[Key]>
      ? { [K in Key]?: z.input<Op[Key]> }
      : { [K in Key]: z.input<Op[Key]> }
    : Record<never, never>;
type InputByOperation = {
  [Op in (typeof apiOperations)[number] as Op["operationId"]]: Field<Op, "params"> &
    Field<Op, "query"> &
    Field<Op, "body">;
};
export type ClientInput<Id extends ApiOperationId> = InputByOperation[Id] & {
  signal?: AbortSignal;
};
type ClientMethod<Id extends ApiOperationId> =
  Record<never, never> extends ClientInput<Id>
    ? (input?: ClientInput<Id>) => Promise<OperationResponse<Id>>
    : (input: ClientInput<Id>) => Promise<OperationResponse<Id>>;
export type WalletClient = { [Id in ApiOperationId]: ClientMethod<Id> };
interface ClientOptions {
  onUnauthorized?: (token: string) => void;
  getIngestToken?: () => string | null;
  retryDelayMs?: number;
}
export class WalletApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WalletApiError";
  }
}
interface RuntimeInput {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  signal?: AbortSignal;
}
const errorSchema = z.object({ code: z.string(), message: z.string() });
const envelopeSchema = z.object({ data: z.unknown(), error: errorSchema.nullable() });
const transientStatus = new Set([408, 425, 429, 500, 502, 503, 504]);
function abortError(signal?: AbortSignal) {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("Request aborted", "AbortError");
}
function queryValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  throw new WalletApiError("Invalid request query value", "INVALID_REQUEST");
}
function backoff(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const aborted = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
function parseInput(schema: ZodType | undefined, value: unknown, operationId: string) {
  if (!schema) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new WalletApiError(`Invalid request for ${operationId}`, "INVALID_REQUEST");
  return parsed.data as Record<string, unknown>;
}
/** Contract methods are prepared independently; callers own authentication and cache state. */
export function createWalletClient(
  getToken: () => string | null,
  options: ClientOptions = {},
): WalletClient {
  const request = async (operation: ApiOperation, input: RuntimeInput = {}) => {
    const signal = input.signal;
    if (signal?.aborted) throw abortError(signal);
    if (operation.auth === "ingest" && !options.getIngestToken)
      throw new WalletApiError("Ingestion authentication is unavailable", "UNAUTHORIZED", 401);
    const params = parseInput(operation.params, input.params, operation.operationId);
    const query = parseInput(operation.query, input.query ?? {}, operation.operationId);
    // Parse validates the wire value; nullable patch fields remain explicit nulls.
    const body = parseInput(operation.body, input.body, operation.operationId);
    const path = operation.path.replace(/\{([^}]+)\}/g, (_match, key: string) =>
      encodeURIComponent(String(params?.[key])),
    );
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) for (const item of value) search.append(key, queryValue(item));
      else search.set(key, queryValue(value));
    }
    const url = search.size ? `${path}?${search}` : path;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw abortError(signal);
      const headers = new Headers({
        Accept: "application/json",
        "X-Client-Operation-Id": operation.operationId,
      });
      if (body !== undefined) headers.set("Content-Type", "application/json");
      const requestToken =
        operation.auth === "none"
          ? null
          : operation.auth === "ingest"
            ? options.getIngestToken?.()
            : getToken();
      if (operation.auth !== "none") {
        if (!requestToken)
          throw new WalletApiError("Unlock Wallet before making this request", "UNAUTHORIZED", 401);
        headers.set("Authorization", `Bearer ${requestToken}`);
      }
      let response: Response;
      try {
        response = await fetch(url, {
          method: operation.method,
          headers,
          signal,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === "AbortError"))
          throw signal?.aborted ? abortError(signal) : error;
        if (operation.method === "GET" && attempt === 0) {
          await backoff(options.retryDelayMs ?? 250, signal);
          continue;
        }
        throw new WalletApiError("Network request failed; please try again", "NETWORK_ERROR");
      }
      // Authentication is acted on even when the upstream body is HTML or empty.
      if (response.status === 401) {
        if (operation.auth === "session" && requestToken) options.onUnauthorized?.(requestToken);
        throw new WalletApiError("Invalid or expired session", "UNAUTHORIZED", 401);
      }
      if (operation.method === "GET" && attempt === 0 && transientStatus.has(response.status)) {
        await backoff(options.retryDelayMs ?? 250, signal);
        continue;
      }
      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === "AbortError"))
          throw signal?.aborted ? abortError(signal) : error;
        throw new WalletApiError(
          "The server returned a non-JSON response; please try again",
          "INVALID_RESPONSE",
          response.status,
        );
      }
      const parsed = envelopeSchema.safeParse(json);
      if (!response.ok) {
        const error = parsed.success ? parsed.data.error : null;
        throw new WalletApiError(
          error?.message ?? `API request failed (${response.status})`,
          error?.code ?? "HTTP_ERROR",
          response.status,
        );
      }
      if (!parsed.success || parsed.data.error || parsed.data.data === null) {
        if (parsed.success && parsed.data.error)
          throw new WalletApiError(
            parsed.data.error.message,
            parsed.data.error.code,
            response.status,
          );
        throw new WalletApiError("Invalid API response", "INVALID_RESPONSE", response.status);
      }
      const data = operation.response.safeParse(parsed.data.data);
      if (!data.success)
        throw new WalletApiError("Invalid API response", "INVALID_RESPONSE", response.status);
      return data.data;
    }
    throw new WalletApiError("API request failed", "HTTP_ERROR");
  };
  // Keys and their input/output schemas originate from this single contract table.
  return Object.fromEntries(
    apiOperations.map((operation) => [
      operation.operationId,
      (input?: RuntimeInput) => request(operation, input),
    ]),
  ) as WalletClient;
}
