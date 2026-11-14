// @vitest-environment jsdom
import { InfiniteQueryObserver, QueryObserver } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

import { createWalletClient } from "./api-client";
import { createWalletMutations } from "./mutations";
import {
  createWalletQueryClient,
  ensureWalletBootstrap,
  recordsQueryOptions,
  referenceQueryOptions,
} from "./wallet-queries";
import { id, record, reference, page, boot } from "../test/wallet-fixtures";

const server = setupServer();
const clients: ReturnType<typeof createWalletQueryClient>[] = [];
const unsubscribers: (() => void)[] = [];
const client = createWalletClient(() => "synthetic-session", { retryDelayMs: 0 });
function cache() {
  const value = createWalletQueryClient();
  clients.push(value);
  return value;
}
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
  for (const value of clients.splice(0)) value.clear();
  server.resetHandlers();
});
afterAll(() => server.close());
const response = (data: unknown) => HttpResponse.json({ data, error: null });
function observe(cache: ReturnType<typeof createWalletQueryClient>) {
  unsubscribers.push(new QueryObserver(cache, referenceQueryOptions(client)).subscribe(() => {}));
  unsubscribers.push(
    new InfiniteQueryObserver(cache, recordsQueryOptions(client)).subscribe(() => {}),
  );
}
test("bootstrap deduplicates and seeds reference plus the actual first infinite page without a second read", async () => {
  let calls = 0;
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => {
      calls++;
      return response(boot);
    }),
  );
  const value = cache();
  await Promise.all([ensureWalletBootstrap(value, client), ensureWalletBootstrap(value, client)]);
  expect(calls).toBe(1);
  expect(value.getQueryData(["reference"])).toMatchObject(reference);
  const loaded = await value.fetchInfiniteQuery(recordsQueryOptions(client));
  expect(loaded.pages[0]?.items[0]?.id).toBe(id);
  expect(loaded.pageParams).toEqual([null]);
});
test("settings only refetches reference while a record patch refetches its active page, never the full snapshot", async () => {
  let referenceReads = 0,
    recordReads = 0;
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => response(boot)),
    http.get("http://test.local/api/wallet/reference", () => {
      referenceReads++;
      return response(reference);
    }),
    http.get("http://test.local/api/records", () => {
      recordReads++;
      return response(page);
    }),
    http.patch("http://test.local/api/settings", () =>
      response({ ...reference.settings, theme: "dark" }),
    ),
    http.patch(`http://test.local/api/records/${id}`, () =>
      response({ ...record, note: "changed" }),
    ),
  );
  const value = cache();
  await ensureWalletBootstrap(value, client);
  observe(value);
  const mutations = createWalletMutations(client, value);
  await mutations["settings.patch"]({ body: { theme: "dark" } });
  expect(referenceReads).toBe(1);
  expect(recordReads).toBe(0);
  await mutations["records.patch"]({ params: { id }, body: { note: "changed" } });
  expect(referenceReads).toBe(2);
  expect(recordReads).toBe(1);
});
test("Query does not multiply the transport's single GET retry", async () => {
  let calls = 0;
  server.use(
    http.get("http://test.local/api/wallet/reference", () => {
      calls++;
      return new HttpResponse("unavailable", { status: 503 });
    }),
  );
  await expect(cache().fetchQuery(referenceQueryOptions(client))).rejects.toMatchObject({
    status: 503,
  });
  expect(calls).toBe(2);
});
test("an aborted bootstrap cannot seed financial data after its session ends", async () => {
  let release!: () => void;
  let started!: () => void;
  const arrived = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return response(boot);
    }),
  );
  const value = cache(),
    controller = new AbortController();
  const pending = ensureWalletBootstrap(value, client, { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await arrived;
  controller.abort();
  release();
  await rejected;
  expect(value.getQueryData(["reference"])).toBeUndefined();
  expect(
    value
      .getQueryCache()
      .getAll()
      .filter((q) => q.queryKey[0] === "records"),
  ).toEqual([]);
});

test("an initial stale read cannot overwrite canonical reference after a mutation settles", async () => {
  let release!: () => void, arrived!: () => void;
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let reads = 0;
  server.use(
    http.get("http://test.local/api/wallet/reference", async () => {
      reads++;
      if (reads === 1) {
        arrived();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return response(reference);
      }
      return response({ ...reference, settings: { ...reference.settings, theme: "dark" } });
    }),
    http.patch("http://test.local/api/settings", () =>
      response({ ...reference.settings, theme: "dark" }),
    ),
  );
  const value = cache();
  const observer = new QueryObserver(value, referenceQueryOptions(client));
  unsubscribers.push(observer.subscribe(() => {}));
  await started;
  // Release the old server response exactly when settlement invalidates the read.
  unsubscribers.push(
    value.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "invalidate") release();
    }),
  );
  try {
    await createWalletMutations(client, value)["settings.patch"]({ body: { theme: "dark" } });
    expect(value.getQueryData(["reference"])).toMatchObject({ settings: { theme: "dark" } });
    expect(reads).toBe(2);
  } finally {
    release();
  }
});
