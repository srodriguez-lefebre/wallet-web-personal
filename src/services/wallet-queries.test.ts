// @vitest-environment jsdom
import { InfiniteQueryObserver, QueryObserver } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { recordCreateSchema } from "@shared/schemas";

import { createWalletClient } from "./api-client";
import { createWalletMutations, waitForWalletMutations } from "./mutations";
import {
  createWalletQueryClient,
  cardLedgerQueryOptions,
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

test("the explicit-read barrier waits for a pending canonical write and is cancelled with its session", async () => {
  let arrived!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  server.use(
    http.patch("http://test.local/api/settings", async () => {
      arrived();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return response(reference.settings);
    }),
  );
  const value = cache();
  const writing = createWalletMutations(client, value)["settings.patch"]({
    body: { theme: "dark" },
  });
  await started;
  const controller = new AbortController();
  let settled = false;
  const waiting = waitForWalletMutations(value, controller.signal).then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  const cancelled = new AbortController();
  const stopped = waitForWalletMutations(value, cancelled.signal);
  cancelled.abort();
  await expect(stopped).rejects.toMatchObject({ name: "AbortError" });
  release();
  await writing;
  await waiting;
  expect(settled).toBe(true);
});

test("a failed import still reconciles canonical pages containing earlier committed rows", async () => {
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => response(boot)),
    http.get("http://test.local/api/wallet/reference", () =>
      response({ ...reference, recordSummary: { ...reference.recordSummary, total: 2 } }),
    ),
    http.get("http://test.local/api/records", () =>
      response({
        ...page,
        items: [record, { ...record, id: "00000000-0000-4000-8000-000000000003" }],
      }),
    ),
    http.post("http://test.local/api/records/import", () =>
      HttpResponse.json(
        {
          data: null,
          error: { code: "IMPORT_FAILED", message: "Earlier batch committed; later batch failed" },
        },
        { status: 409 },
      ),
    ),
  );
  const value = cache();
  await ensureWalletBootstrap(value, client);
  observe(value);
  const { id: omitted, ...input } = record;
  void omitted;
  await expect(
    createWalletMutations(client, value)["records.import"]({
      body: { records: [recordCreateSchema.parse(input)] },
    }),
  ).rejects.toThrow("Earlier batch committed");
  expect(value.getQueryData(["reference"])).toMatchObject({ recordSummary: { total: 2 } });
  const loaded = await value.fetchInfiniteQuery(recordsQueryOptions(client));
  expect(loaded.pages[0]?.items).toHaveLength(2);
});
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

test("card mutations refresh their active ledger while settings leave card history cached", async () => {
  let reads = 0;
  const ledger = {
    creditCardRecords: [],
    creditCardStatements: [],
    creditCardPayments: [],
    creditCardPaymentAllocations: [],
  };
  const card = {
    id,
    name: "Synthetic card",
    issuer: "Synthetic bank",
    lastFour: "1234",
    creditLimit: 1000,
    limitCurrency: "UYU",
    closingDay: 20,
    dueDay: 5,
    color: "#123456",
    icon: "credit-card",
    isActive: true,
  };
  server.use(
    http.get(`http://test.local/api/cards/${id}/ledger`, () => {
      reads++;
      return response(ledger);
    }),
    http.patch("http://test.local/api/settings", () =>
      response({ ...reference.settings, theme: "dark" }),
    ),
    http.patch(`http://test.local/api/cards/${id}`, () =>
      response({ ...card, name: "Synthetic updated card" }),
    ),
  );
  const value = cache(),
    options = cardLedgerQueryOptions(client, id);
  await value.fetchQuery(options);
  unsubscribers.push(new QueryObserver(value, options).subscribe(() => {}));
  const mutations = createWalletMutations(client, value);
  await mutations["settings.patch"]({ body: { theme: "dark" } });
  expect(reads).toBe(1);
  await mutations["cards.patch"]({ params: { id }, body: { name: "Synthetic updated card" } });
  expect(reads).toBe(2);
});

test("empty UI filters share the seeded first page and active search keys retain their modes", async () => {
  server.use(http.post("http://test.local/api/wallet/bootstrap-reference", () => response(boot)));
  const value = cache();
  await ensureWalletBootstrap(value, client);
  const loaded = await value.fetchInfiniteQuery(
    recordsQueryOptions(client, {
      type: "all",
      paymentStatus: "all",
      search: "  ",
      note: "",
      timeZone: "America/Montevideo",
      categoryMode: "descendants",
      searchMode: "wallet",
    }),
  );
  expect(loaded.pages[0]?.items[0]?.id).toBe(id);
  const key = recordsQueryOptions(client, {
    search: "  café  ",
    searchMode: "wallet",
    categoryId: id,
    categoryMode: "descendants",
    from: "2026-11-01",
    timeZone: "America/Montevideo",
  }).queryKey;
  expect(key).toEqual([
    "records",
    {
      search: "café",
      searchMode: "wallet",
      categoryId: id,
      categoryMode: "descendants",
      from: "2026-11-01",
      timeZone: "America/Montevideo",
      limit: 100,
    },
  ]);
});

test("renaming a category or tag refreshes active record search results", async () => {
  let reads = 0;
  server.use(
    http.get("http://test.local/api/records", () => {
      reads++;
      return response(page);
    }),
    http.patch(`http://test.local/api/categories/${id}`, () =>
      response({
        id,
        name: "Synthetic renamed category",
        color: "blue",
        icon: "tag",
        isSystem: false,
        isSelectable: true,
      }),
    ),
    http.patch(`http://test.local/api/tags/${id}`, () =>
      response({ id, name: "Synthetic renamed tag", color: "blue", isActive: true }),
    ),
  );
  const value = cache();
  unsubscribers.push(
    new InfiniteQueryObserver(
      value,
      recordsQueryOptions(client, { search: "café", searchMode: "wallet" }),
    ).subscribe(() => {}),
  );
  await value.fetchInfiniteQuery(
    recordsQueryOptions(client, { search: "café", searchMode: "wallet" }),
  );
  const actions = createWalletMutations(client, value);
  await actions["categories.patch"]({
    params: { id },
    body: { name: "Synthetic renamed category" },
  });
  expect(reads).toBe(2);
  await actions["tags.patch"]({ params: { id }, body: { name: "Synthetic renamed tag" } });
  expect(reads).toBe(3);
});

test.each(["session", "request"] as const)(
  "a cancelled %s cannot send a mutation",
  async (aborted) => {
    let writes = 0;
    server.use(
      http.patch("http://test.local/api/settings", () => {
        writes++;
        return response(reference.settings);
      }),
    );
    const session = new AbortController(),
      request = new AbortController();
    const actions = createWalletMutations(client, cache(), { signal: session.signal });
    (aborted === "session" ? session : request).abort();
    await expect(
      actions["settings.patch"]({ body: { theme: "dark" }, signal: request.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(writes).toBe(0);
  },
);

test("ending the session while query cancellation is pending prevents a late write or refetch", async () => {
  let writes = 0,
    reads = 0;
  server.use(
    http.get("http://test.local/api/wallet/reference", () => {
      reads++;
      return response(reference);
    }),
    http.patch("http://test.local/api/settings", () => {
      writes++;
      return response(reference.settings);
    }),
  );
  const value = cache();
  unsubscribers.push(new QueryObserver(value, referenceQueryOptions(client)).subscribe(() => {}));
  await value.fetchQuery(referenceQueryOptions(client));
  let release!: () => void, started!: () => void;
  const arrived = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cancellation = vi.spyOn(value, "cancelQueries").mockImplementation(async () => {
    started();
    await blocked;
  });
  const session = new AbortController();
  const action = createWalletMutations(client, value, { signal: session.signal })["settings.patch"](
    { body: { theme: "dark" } },
  );
  await arrived;
  session.abort();
  release();
  try {
    await expect(action).rejects.toMatchObject({ name: "AbortError" });
    expect(writes).toBe(0);
    expect(reads).toBe(1);
  } finally {
    cancellation.mockRestore();
  }
});
