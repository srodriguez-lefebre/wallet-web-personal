import { afterEach, beforeEach, expect, test, vi } from "vitest";

import handler from "../../api/index.js";
import * as clients from "../db/client.js";
import { createSessionToken } from "./auth.js";

import type { VercelRequest, VercelResponse } from "@vercel/node";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "synthetic-pipeline-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function call(
  path: string,
  method = "GET",
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  let status = 200;
  let result: { error?: { code: string } } = {};
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status: (n: number) => {
      status = n;
      return res;
    },
    json: (value: typeof result) => {
      result = value;
      return res;
    },
    get statusCode() {
      return status;
    },
  };
  await handler(
    {
      method,
      query: { path },
      url: `/api/${path}`,
      headers: {
        ...options.headers,
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body,
    } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return { status, result, headers };
}
test("private auth runs before malformed params, JSON and operation mismatch, without a DB", async () => {
  const db = vi.spyOn(clients, "createDb");
  for (const response of [
    await call("accounts/not-a-uuid", "PATCH", { body: "{" }),
    await call("accounts", "GET", { headers: { "x-client-operation-id": "records.list" } }),
  ]) {
    expect(response.status).toBe(401);
    expect(response.result.error?.code).toBe("UNAUTHORIZED");
  }
  expect(db).not.toHaveBeenCalled();
});
test("method errors have Allow and private auth still precedes them", async () => {
  expect((await call("accounts", "TRACE")).status).toBe(401);
  const response = await call("accounts", "TRACE", { token: createSessionToken().token });
  expect(response.status).toBe(405);
  expect(response.headers.Allow).toBe("GET, POST");
  expect((await call("not-present")).status).toBe(404);
});
test("ingest accepts only its exact path and dedicated auth", async () => {
  vi.stubEnv("INGEST_API_TOKEN", "synthetic-ingest");
  expect(
    (await call("ingest/mail/transactions/extra", "POST", { token: "synthetic-ingest" })).status,
  ).toBe(404);
  expect(
    (await call("ingest/mail/transactions", "POST", { token: createSessionToken().token })).status,
  ).toBe(401);
});

test("one structured log per request shares the response id and excludes request contents", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await call("health", "GET", {
    token: createSessionToken().token,
    body: "synthetic-private-value",
    headers: { "x-private": "synthetic-private-value" },
  });
  expect(response.status).toBe(200);
  expect(log).toHaveBeenCalledTimes(1);
  const metadata = JSON.parse(log.mock.calls[0]![0] as string) as Record<string, unknown>;
  expect(metadata).toMatchObject({
    requestId: response.headers["X-Request-Id"],
    operation: "health.get",
    method: "GET",
    status: 200,
  });
  expect(JSON.stringify(metadata)).not.toContain("synthetic-private-value");
  expect(response.headers["X-Operation-Id"]).toBe("health.get");
  const mismatch = await call("health", "GET", {
    token: createSessionToken().token,
    headers: { "x-client-operation-id": "records.list" },
  });
  expect(mismatch.status).toBe(400);
  expect(mismatch.result.error?.code).toBe("CONTRACT_MISMATCH");
});
