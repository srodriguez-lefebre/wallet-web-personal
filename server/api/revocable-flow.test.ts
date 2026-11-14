import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import handler from "../../api/index.js";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createSessionToken } from "./auth.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE auth_attempts,settings");
  vi.stubEnv("API_TOKEN", "synthetic-master");
  vi.stubEnv("SESSION_SECRET", "synthetic-independent");
  vi.stubEnv("WALLET_REVOCABLE_SESSIONS", "true");
  vi.stubEnv("LEGACY_SESSION_ACCEPT_UNTIL", new Date(Date.now() + 45 * 86400000).toISOString());
});
async function call(path: string, method = "GET", token?: string, body?: unknown) {
  let status = 200;
  let data: unknown;
  let error: unknown;
  const res = {
    setHeader: vi.fn(),
    status: (s: number) => {
      status = s;
      return res;
    },
    json: (p: { data: unknown; error: unknown }) => {
      data = p.data;
      error = p.error;
      return res;
    },
  };
  await handler(
    {
      method,
      url: `/api/${path}`,
      query: { path },
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    } as never,
    res as never,
  );
  return { status, data, error };
}
async function unlock() {
  const r = await call("auth/unlock", "POST", undefined, { token: "synthetic-master" });
  expect(r.status).toBe(200);
  return (r.data as { token: string }).token;
}
test("lock-all revokes a second independent session and unlock uses the current version", async () => {
  const first = await unlock(),
    second = await unlock();
  expect((await call("health", "GET", second)).status).toBe(200);
  expect((await call("auth/session", "GET", first)).data).toEqual({ revocable: true });
  expect((await call("auth/lock-all", "POST", first)).status).toBe(200);
  expect((await call("health", "GET", second)).status).toBe(401);
  expect((await call("health", "GET", first)).status).toBe(401);
  expect((await call("health", "GET", await unlock())).status).toBe(200);
});
test("default profile keeps legacy tokens and lock-all stays disabled", async () => {
  vi.stubEnv("WALLET_REVOCABLE_SESSIONS", "false");
  const token = createSessionToken().token;
  expect((await call("auth/session", "GET", token)).data).toEqual({ revocable: false });
  expect((await call("auth/lock-all", "POST", token)).status).toBe(503);
  expect((await call("health", "GET", token)).status).toBe(200);
  const fresh = await unlock();
  const payload = JSON.parse(Buffer.from(fresh.split(".")[0]!, "base64url").toString()) as Record<
    string,
    unknown
  >;
  expect(payload).toHaveProperty("sub");
  expect(payload).not.toHaveProperty("ver");
});
