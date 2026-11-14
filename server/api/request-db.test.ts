import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import handler from "../../api/index.js";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import * as clients from "../db/client.js";
import { isValidSessionToken } from "./auth.js";

import type { VercelRequest, VercelResponse } from "@vercel/node";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const master = "synthetic-request-db-master";
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  vi.stubEnv("API_TOKEN", master);
  vi.stubEnv("SESSION_SECRET", "synthetic-request-db-signing");
}, 60_000);
afterAll(async () => {
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE auth_attempts");
});

async function unlock(body: unknown) {
  let status = 200;
  let result: { data?: { token: string }; error?: { code: string } } = {};
  const response = {
    setHeader: vi.fn(),
    status(code: number) {
      status = code;
      return response;
    },
    json(value: typeof result) {
      result = value;
      return response;
    },
  };
  await handler(
    {
      method: "POST",
      query: { path: "auth/unlock" },
      headers: {},
      body,
    } as unknown as VercelRequest,
    response as unknown as VercelResponse,
  );
  return { status, result };
}

test("an unlock request shares one database client without changing its session format", async () => {
  const spy = vi.spyOn(clients, "createDb");
  try {
    const response = await unlock({ token: master });
    expect(response.status).toBe(200);
    expect(isValidSessionToken(response.result.data?.token ?? null)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});
test("malformed unlock bodies fail before creating any database client", async () => {
  const spy = vi.spyOn(clients, "createDb");
  try {
    const response = await unlock({ token: "" });
    expect(response.status).toBe(400);
    expect(response.result.error?.code).toBe("VALIDATION_ERROR");
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
