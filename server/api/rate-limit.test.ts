import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDb } from "../db/client.js";
import { assertUnlockAllowed, clearUnlockFailures, registerUnlockFailure } from "./rate-limit.js";

import type { VercelRequest } from "@vercel/node";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const request = (ip: string) =>
  ({ headers: { "x-forwarded-for": ip } }) as unknown as VercelRequest;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  vi.stubEnv("SESSION_SECRET", "synthetic-rate-limit-signing");
}, 60_000);
afterAll(async () => {
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE auth_attempts");
});

test("distributed failures exhaust a global window and a success cannot reset it", async () => {
  const db = createDb();
  for (let i = 0; i < 20; i++) {
    const attempt = await assertUnlockAllowed(db, request(`192.0.2.${i}`));
    expect(attempt.allowed).toBe(true);
    if (!attempt.allowed) throw new Error("Unexpected local block");
    await registerUnlockFailure(db, attempt.key);
    await clearUnlockFailures(db, attempt.key);
  }
  const blocked = await assertUnlockAllowed(db, request("198.51.100.1"));
  expect(blocked.allowed).toBe(false);
  if (blocked.allowed) throw new Error("Expected global block");
  expect(blocked.retryAfter).toBeGreaterThan(0);
});
test("concurrent failures increment atomically instead of losing counts", async () => {
  const db = createDb(),
    attempt = await assertUnlockAllowed(db, request("192.0.2.44"));
  if (!attempt.allowed) throw new Error("Unexpected block");
  await Promise.all(Array.from({ length: 8 }, () => registerUnlockFailure(db, attempt.key)));
  const rows = await fixture.pool.query<{ failed_count: number }>(
    "SELECT failed_count FROM auth_attempts WHERE key=$1",
    [attempt.key],
  );
  expect(rows.rows[0]?.failed_count).toBe(8);
  expect((await assertUnlockAllowed(db, request("192.0.2.44"))).allowed).toBe(false);
});
test("expired windows can unlock again while a different live IP remains independent", async () => {
  const db = createDb(),
    attempt = await assertUnlockAllowed(db, request("192.0.2.2"));
  if (!attempt.allowed) throw new Error("Unexpected block");
  for (let i = 0; i < 5; i++) await registerUnlockFailure(db, attempt.key);
  expect((await assertUnlockAllowed(db, request("192.0.2.2"))).allowed).toBe(false);
  expect((await assertUnlockAllowed(db, request("192.0.2.3"))).allowed).toBe(true);
  await fixture.pool.query(
    "UPDATE auth_attempts SET window_started_at=now()-interval '1 day',blocked_until=now()-interval '1 day'",
  );
  expect((await assertUnlockAllowed(db, request("192.0.2.2"))).allowed).toBe(true);
});

test("unlock prunes old attempts at most hourly with a persisted claim", async () => {
  await fixture.pool.query("TRUNCATE settings,auth_attempts");
  await fixture.pool.query(
    "INSERT INTO auth_attempts(key,failed_count,window_started_at) VALUES('old-key',3,now()-interval '2 days')",
  );
  await assertUnlockAllowed(createDb(), request("192.0.2.90"));
  expect(
    (await fixture.pool.query("SELECT key FROM auth_attempts WHERE key='old-key'")).rows,
  ).toEqual([]);
  await fixture.pool.query(
    "INSERT INTO auth_attempts(key,failed_count,window_started_at) VALUES('old-key',3,now()-interval '2 days')",
  );
  await assertUnlockAllowed(createDb(), request("192.0.2.90"));
  expect(
    (await fixture.pool.query("SELECT key FROM auth_attempts WHERE key='old-key'")).rows,
  ).toHaveLength(1);
  await fixture.pool.query("UPDATE settings SET auth_attempts_pruned_at=now()-interval '2 hours'");
  await assertUnlockAllowed(createDb(), request("192.0.2.90"));
  expect(
    (await fixture.pool.query("SELECT key FROM auth_attempts WHERE key='old-key'")).rows,
  ).toEqual([]);
});
