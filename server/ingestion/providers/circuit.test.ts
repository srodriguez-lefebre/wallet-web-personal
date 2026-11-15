import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../../scripts/sandbox/postgres-test";
import { createDb } from "../../db/client";
import { runProvider } from "./circuit";
import { withProviderBudget } from "./budget";
import { pruneExpiredMetadata } from "../metadata";

import type { Provider } from "./types";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const now = new Date("2026-04-01T00:00:00Z");
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE provider_state,ingestion_events CASCADE");
});
afterAll(async () => {
  await fixture?.close();
});

test("failures open a persistent circuit, one half-open probe recovers, and stale success cannot close a newer circuit", async () => {
  const call = vi.fn().mockResolvedValue({ status: "failed", reason: "synthetic_outage" });
  const provider: Provider<string, string> = { name: "synthetic", call };
  for (let i = 0; i < 3; i++) await runProvider(createDb(), provider, "x", { budgetMs: 100, now });
  expect((await runProvider(createDb(), provider, "x", { budgetMs: 100, now })).reason).toBe(
    "circuit_open",
  );
  expect(call).toHaveBeenCalledTimes(3);
  let finish: (value: { status: "ok"; value: string }) => void = () => {};
  call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const later = new Date(now.getTime() + 300001);
  const probe = runProvider(createDb(), provider, "x", { budgetMs: 1000, now: later });
  await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(4));
  expect(
    (await runProvider(createDb(), provider, "x", { budgetMs: 1000, now: later })).reason,
  ).toBe("circuit_open");
  finish({ status: "ok", value: "recovered" });
  expect(await probe).toMatchObject({ status: "ok", value: "recovered" });
  expect(
    (
      await fixture.pool.query(
        "SELECT failures,open_until FROM provider_state WHERE name='synthetic'",
      )
    ).rows,
  ).toMatchObject([{ failures: 0, open_until: null }]);
});

test("concurrent failures cannot extend the open interval and late results cannot reset it", async () => {
  const completions: ((
    value: { status: "ok"; value: string } | { status: "failed"; reason: string },
  ) => void)[] = [];
  const provider: Provider<string, string> = {
    name: "parallel",
    call: () =>
      new Promise((resolve) => {
        completions.push(resolve);
      }),
  };
  const calls = Array.from({ length: 5 }, () =>
    runProvider(createDb(), provider, "x", { budgetMs: 1000, now }),
  );
  await vi.waitFor(() => expect(completions).toHaveLength(5));
  for (const complete of completions.slice(0, 3)) complete({ status: "failed", reason: "outage" });
  await vi.waitFor(async () =>
    expect(
      (await fixture.pool.query("SELECT failures FROM provider_state WHERE name='parallel'"))
        .rows[0].failures,
    ).toBe(3),
  );
  completions[3]!({ status: "ok", value: "stale success" });
  completions[4]!({ status: "failed", reason: "late failure" });
  await Promise.all(calls);
  expect(
    (
      await fixture.pool.query(
        "SELECT failures,open_until FROM provider_state WHERE name='parallel'",
      )
    ).rows,
  ).toMatchObject([{ failures: 3, open_until: new Date(now.getTime() + 300000) }]);
});

test("budget bounds even a provider that ignores abort, and forwards an abort signal", async () => {
  let signal: AbortSignal | undefined;
  const started = performance.now();
  await expect(
    withProviderBudget(20, undefined, (context) => {
      signal = context.signal;
      return new Promise(() => {});
    }),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  expect(signal?.aborted).toBe(true);
  expect(performance.now() - started).toBeLessThan(500);
});

test("metadata pruning is claimed at most hourly across workers", async () => {
  await fixture.pool.query(
    "INSERT INTO ingestion_events(idempotency_key,source,sanitized_payload,metadata_expires_at) VALUES('old-1','generic','{}','2020-01-01')",
  );
  await Promise.all(Array.from({ length: 4 }, () => pruneExpiredMetadata(createDb(), now)));
  await fixture.pool.query(
    "INSERT INTO ingestion_events(idempotency_key,source,sanitized_payload,metadata_expires_at) VALUES('old-2','generic','{}','2020-01-01')",
  );
  await pruneExpiredMetadata(createDb(), new Date(now.getTime() + 3599999));
  expect(
    (
      await fixture.pool.query(
        "SELECT sanitized_payload FROM ingestion_events WHERE idempotency_key='old-2'",
      )
    ).rows,
  ).toEqual([{ sanitized_payload: {} }]);
  await pruneExpiredMetadata(createDb(), new Date(now.getTime() + 3600000));
  expect(
    (
      await fixture.pool.query(
        "SELECT sanitized_payload FROM ingestion_events WHERE idempotency_key='old-2'",
      )
    ).rows,
  ).toEqual([{ sanitized_payload: null }]);
});
