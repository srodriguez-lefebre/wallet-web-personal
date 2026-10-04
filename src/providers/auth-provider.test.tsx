import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";
import { createSession } from "../services/auth-service";

vi.mock("@/services/auth-service");
let context: ReturnType<typeof useAuth>,
  tree: ReactTestRenderer | undefined,
  storage: Map<string, string>;
function Consumer() {
  const value = useAuth();
  useEffect(() => {
    context = value;
  }, [value]);
  return <p>{value.isUnlocked ? "open" : "locked"}</p>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  storage = new Map([
    ["wallet-session-token", "test-session"],
    [
      "wallet-session-expires-at",
      new Date(Date.now() + 30 * 60_000).toISOString(),
    ],
    ["wallet-dataset-cache", "private-data"],
  ]);
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      localStorage,
      sessionStorage: { getItem: () => null, removeItem: vi.fn() },
      atob,
      setTimeout,
      clearTimeout,
    }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function mount() {
  await act(async () => {
    tree = create(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
  });
}
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

test("session expiration locks an already open wallet and removes private cached data", async () => {
  storage.set(
    "wallet-session-expires-at",
    new Date(Date.now() + 60_000).toISOString(),
  );
  await mount();
  expect(context.isUnlocked).toBe(true);
  await advance(60_001);
  expect(context.isUnlocked).toBe(false);
  expect(storage.has("wallet-session-token")).toBe(false);
  expect(storage.has("wallet-dataset-cache")).toBe(false);
});
test("a legacy inactivity preference cannot lock an otherwise valid session", async () => {
  storage.set("wallet-auto-lock-minutes", "5");
  await mount();
  await advance(2 * 60_000);
  await act(async () => {
    window.dispatchEvent(new Event("pointerdown"));
  });
  await advance(4 * 60_000);
  expect(context.isUnlocked).toBe(true);
  await advance(60_001);
  expect(context.isUnlocked).toBe(true);
  expect(storage.has("wallet-auto-lock-minutes")).toBe(false);
});
test("a disabled inactivity lock leaves a valid session open", async () => {
  await mount();
  await advance(20 * 60_000);
  expect(context.isUnlocked).toBe(true);
});
test("storage failures still allow an in-memory session and a clean lock", async () => {
  const denied = () => {
    throw new Error("storage disabled");
  };
  Object.assign(window.localStorage, {
    getItem: denied,
    setItem: denied,
    removeItem: denied,
  });
  vi.mocked(createSession).mockResolvedValue({
    token: "temporary-session",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await mount();
  expect(context.isUnlocked).toBe(false);
  await act(async () => {
    expect(await context.unlock("local-code")).toBe(true);
  });
  expect(context.isUnlocked).toBe(true);
  await act(async () => context.lock());
  expect(context.isUnlocked).toBe(false);
});
test("the signed expiration cannot be extended by browser storage", async () => {
  storage.set(
    "wallet-session-token",
    `${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 }))}.signature`,
  );
  await mount();
  await advance(60_001);
  expect(context.isUnlocked).toBe(false);
});
test("obsolete inactivity events are ignored while session expiration remains active", async () => {
  await mount();
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent("wallet:auto-lock-change", { detail: 5 }),
    );
  });
  await advance(5 * 60_000 + 1);
  expect(context.isUnlocked).toBe(true);
  await advance(25 * 60_000);
  expect(context.isUnlocked).toBe(false);
});
test("a late unlock response cannot reopen a wallet that was explicitly locked", async () => {
  await mount();
  let release!: (value: { token: string; expiresAt: string }) => void;
  vi.mocked(createSession).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = context.unlock("local-code");
    context.lock();
  });
  await act(async () => {
    release({
      token: "late-session",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await pending).toBe(false);
  });
  expect(context.isUnlocked).toBe(false);
  expect(storage.has("wallet-session-token")).toBe(false);
});
test("returning to a suspended tab checks expiration before accepting activity", async () => {
  await mount();
  vi.setSystemTime(new Date(Date.now() + 31 * 60_000));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(context.isUnlocked).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
test("a cross-tab lock invalidates a pending unlock response", async () => {
  await mount();
  let release!: (value: { token: string; expiresAt: string }) => void;
  vi.mocked(createSession).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = context.unlock("local-code");
    storage.delete("wallet-session-token");
    storage.delete("wallet-session-expires-at");
    const event = new Event("storage");
    Object.assign(event, { key: "wallet-session-token" });
    window.dispatchEvent(event);
  });
  expect(context.isUnlocked).toBe(false);
  await act(async () => {
    release({
      token: "late-session",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await pending).toBe(false);
  });
  expect(context.isUnlocked).toBe(false);
});
