// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth-provider";

let auth: ReturnType<typeof useAuth>;
const expiration = () => new Date(Date.now() + 60_000).toISOString();
function Consumer() {
  const value = useAuth();
  useEffect(() => {
    auth = value;
  }, [value]);
  return <p>{value.isUnlocked ? "open" : "locked"}</p>;
}
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("wallet-session-token", "synthetic-session-A");
  window.localStorage.setItem("wallet-session-expires-at", expiration());
  window.localStorage.setItem("wallet-dataset-cache", "synthetic-reference");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}
test("the active client's HTML 401 locks and clears the session and reference cache", async () => {
  vi.stubGlobal("fetch", async () => new Response("<html>upstream</html>", { status: 401 }));
  mount();
  await act(async () => {
    await expect(auth.client["accounts.list"]()).rejects.toMatchObject({ status: 401 });
  });
  expect(auth.isUnlocked).toBe(false);
  expect(window.localStorage.getItem("wallet-session-token")).toBeNull();
  expect(window.localStorage.getItem("wallet-dataset-cache")).toBeNull();
});
test("an old request's late 401 cannot lock a newly unlocked session", async () => {
  let release!: (response: Response) => void;
  const observed: (string | null)[] = [];
  vi.stubGlobal("fetch", (path: string, init: RequestInit) => {
    if (path === "/api/auth/unlock") {
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
      return Promise.resolve(
        Response.json({
          data: { token: "synthetic-session-B", expiresAt: expiration() },
          error: null,
        }),
      );
    }
    observed.push(new Headers(init.headers).get("Authorization"));
    if (observed.length === 1)
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Promise.resolve(Response.json({ data: [], error: null }));
  });
  mount();
  const client = auth.client;
  const oldRequest = client["accounts.list"]();
  const rejected = expect(oldRequest).rejects.toMatchObject({ status: 401 });
  await act(async () => {
    expect(await auth.unlock("synthetic-master")).toBe(true);
  });
  await act(async () => {
    release(new Response("denied", { status: 401 }));
    await rejected;
  });
  expect(auth.token).toBe("synthetic-session-B");
  expect(auth.client).toBe(client);
  await expect(client["accounts.list"]()).resolves.toEqual([]);
  expect(observed).toEqual(["Bearer synthetic-session-A", "Bearer synthetic-session-B"]);
});
test("a cross-tab replacement also protects the new session from a late 401", async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  mount();
  const oldRequest = auth.client["accounts.list"]();
  const rejected = expect(oldRequest).rejects.toMatchObject({ status: 401 });
  await act(async () => {
    window.localStorage.setItem("wallet-session-token", "synthetic-session-B");
    window.dispatchEvent(new StorageEvent("storage", { key: "wallet-session-token" }));
  });
  await act(async () => {
    release(new Response(null, { status: 401 }));
    await rejected;
  });
  expect(auth.token).toBe("synthetic-session-B");
  expect(auth.isUnlocked).toBe(true);
});
test("a locked client's operations do not send a former session", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return Response.json({ data: [], error: null });
  });
  mount();
  const client = auth.client;
  await act(async () => auth.lock());
  await expect(client["accounts.list"]()).rejects.toMatchObject({ status: 401 });
  expect(calls).toBe(0);
});

test("the retired global unauthorized event cannot lock the shared client's session", () => {
  mount();
  act(() => {
    window.dispatchEvent(new Event("wallet:unauthorized"));
  });
  expect(auth.isUnlocked).toBe(true);
});
