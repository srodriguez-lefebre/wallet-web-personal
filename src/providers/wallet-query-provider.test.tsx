// @vitest-environment jsdom
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { StrictMode, useEffect } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";

import { recordsQueryOptions, referenceQueryOptions } from "../services/wallet-queries";
import { boot, reference, record } from "../test/wallet-fixtures";
import { AuthProvider, useAuth } from "./auth-provider";
import { WalletQueryProvider, useWalletBootstrap, useWalletData } from "./wallet-query-provider";

const server = setupServer();
let auth: ReturnType<typeof useAuth>;
let cache: QueryClient;
let data: ReturnType<typeof useWalletData>;
const expiration = () => new Date(Date.now() + 60_000).toISOString();
const response = (value: unknown) => HttpResponse.json({ data: value, error: null });
function Probe() {
  const current = useQueryClient();
  const value = useWalletData();
  useEffect(() => {
    cache = current;
    data = value;
  }, [current, value]);
  return null;
}
function Ready() {
  const { client } = useWalletData();
  const refs = useQuery(referenceQueryOptions(client));
  const records = useInfiniteQuery(recordsQueryOptions(client));
  return (
    <p>
      {refs.data?.settings.theme}:{records.data?.pages[0]?.items[0]?.amount}
    </p>
  );
}
function Gate() {
  const value = useWalletBootstrap();
  if (value.isPending) return <p>Loading</p>;
  if (value.isError) return <button onClick={() => void value.refetch()}>Retry</button>;
  return <Ready />;
}
function Root() {
  const value = useAuth();
  useEffect(() => {
    auth = value;
  }, [value]);
  if (!value.isUnlocked) return <p>Locked</p>;
  return (
    <WalletQueryProvider>
      <Probe />
      <Gate />
    </WalletQueryProvider>
  );
}
function mount() {
  return render(
    <StrictMode>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </StrictMode>,
  );
}
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("wallet-dataset-cache", "obsolete-reference");
  window.localStorage.setItem("wallet-session-token", "synthetic-session-A");
  window.localStorage.setItem("wallet-session-expires-at", expiration());
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

test("StrictMode bootstraps once and seeds active reference and infinite-page consumers", async () => {
  let posts = 0;
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => {
      posts++;
      return response(boot);
    }),
  );
  mount();
  await screen.findByText("system:10");
  expect(posts).toBe(1);
  expect(
    cache
      .getQueryCache()
      .getAll()
      .some((q) => q.queryKey.includes("synthetic-session-A")),
  ).toBe(false);
  expect(window.localStorage.getItem("wallet-dataset-cache")).toBeNull();
});
test("locking aborts late bootstrap, empties its cache and isolates the next session", async () => {
  let arrived!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let posts = 0;
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", async () => {
      posts++;
      if (posts === 1) {
        arrived();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return response(boot);
    }),
    http.post("http://test.local/api/auth/unlock", () =>
      response({ token: "synthetic-session-B", expiresAt: expiration() }),
    ),
  );
  mount();
  await started;
  const old = cache;
  await act(async () => {
    auth.lock();
    await Promise.resolve();
  });
  expect(screen.getByText("Locked")).toBeDefined();
  expect(old.getQueryCache().getAll()).toEqual([]);
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(old.getQueryCache().getAll()).toEqual([]);
  await act(async () => {
    expect(await auth.unlock("synthetic-master")).toBe(true);
  });
  await screen.findByText("system:10");
  expect(cache).not.toBe(old);
  expect(posts).toBe(2);
});
test("a query's 401 locks the active session and clears its in-memory financial data", async () => {
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => response(boot)),
    http.get(
      "http://test.local/api/wallet/reference",
      () => new HttpResponse("Unauthorized", { status: 401 }),
    ),
  );
  mount();
  await screen.findByText("system:10");
  const previous = cache;
  await act(async () => {
    await previous.invalidateQueries({ queryKey: ["reference"] });
  });
  await screen.findByText("Locked");
  await waitFor(() => expect(previous.getQueryCache().getAll()).toEqual([]));
  expect(screen.queryByText("system:10")).toBeNull();
});
test("settings refreshes only reference; record edits refresh their active page without a snapshot", async () => {
  let refs = 0,
    records = 0;
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => response(boot)),
    http.get("http://test.local/api/wallet/reference", () => {
      refs++;
      return response({ ...reference, settings: { ...reference.settings, theme: "dark" } });
    }),
    http.get("http://test.local/api/records", () => {
      records++;
      return response({ ...boot.recordsPage, items: [{ ...record, amount: 20 }] });
    }),
    http.patch("http://test.local/api/settings", () =>
      response({ ...reference.settings, theme: "dark" }),
    ),
    http.patch(`http://test.local/api/records/${record.id}`, () =>
      response({ ...record, amount: 20 }),
    ),
  );
  mount();
  await screen.findByText("system:10");
  await act(async () => {
    await data.mutations["settings.patch"]({ body: { theme: "dark" } });
  });
  await screen.findByText("dark:10");
  expect(refs).toBe(1);
  expect(records).toBe(0);
  await act(async () => {
    await data.mutations["records.patch"]({ params: { id: record.id }, body: { amount: 20 } });
  });
  await screen.findByText("dark:20");
  expect(refs).toBe(2);
  expect(records).toBe(1);
});
