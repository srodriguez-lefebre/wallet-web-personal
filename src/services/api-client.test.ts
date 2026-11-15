import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import { apiOperations } from "@shared/api-contract";

import { createWalletClient, type ClientInput, type WalletClient } from "./api-client";

const id = "00000000-0000-4000-8000-000000000001";
const template = {
  id,
  name: "Synthetic coffee",
  type: "expense",
  amount: 20,
  currency: "UYU",
  paymentType: "cash",
};
const envelope = (data: unknown, status = 200) => Response.json({ data, error: null }, { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("client exposes every contract operation with typed results", async () => {
  const client = createWalletClient(() => "session");
  expect(Object.keys(client).sort()).toEqual(apiOperations.map((op) => op.operationId).sort());
  vi.stubGlobal("fetch", async () => envelope([template]));
  const result = await client["recordTemplates.list"]();
  expect(result[0]?.name).toBe("Synthetic coffee");
  expectTypeOf(result).toMatchTypeOf<{ id: string; name: string }[]>();
});
test("contract builds method, encoded path, body and operation header", async () => {
  let observed: { path: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    observed = { path, init };
    return envelope(template);
  });
  await createWalletClient(() => "current-session")["recordTemplates.patch"]({
    params: { id },
    body: { note: null },
  });
  expect(observed?.path).toBe(`/api/record-templates/${id}`);
  expect(observed?.init.method).toBe("PATCH");
  expect(JSON.parse(observed?.init.body as string)).toEqual({ note: null });
  const headers = new Headers(observed?.init.headers);
  expect(headers.get("Authorization")).toBe("Bearer current-session");
  expect(headers.get("X-Client-Operation-Id")).toBe("recordTemplates.patch");
});
test("query encoding preserves cursor characters and excludes undefined", async () => {
  let path = "";
  vi.stubGlobal("fetch", async (value: string) => {
    path = value;
    return envelope({ items: [], nextCursor: null, hasMore: false });
  });
  await createWalletClient(() => "session")["records.list"]({
    query: { limit: 25, cursor: "cursor/+?=", search: undefined },
  });
  const url = new URL(path, "http://synthetic.local");
  expect(url.pathname).toBe("/api/records");
  expect(url.searchParams.get("cursor")).toBe("cursor/+?=");
  expect(url.searchParams.get("limit")).toBe("25");
  expect(url.searchParams.has("search")).toBe(false);
});
test("public unlock never forwards a session and invalid unlock does not invoke session lock", async () => {
  let headers = new Headers();
  let locked = 0;
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    headers = new Headers(init.headers);
    return Response.json(
      { data: null, error: { code: "UNAUTHORIZED", message: "Invalid token" } },
      { status: 401 },
    );
  });
  await expect(
    createWalletClient(() => "private-session", {
      onUnauthorized: () => {
        locked++;
      },
    })["auth.unlock"]({ body: { token: "synthetic-master" } }),
  ).rejects.toMatchObject({ status: 401 });
  expect(headers.has("Authorization")).toBe(false);
  expect(locked).toBe(0);
});
test("401 locks before trying to parse a non-JSON response and never retries", async () => {
  let calls = 0,
    locked = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return new Response("<html>private upstream detail</html>", { status: 401 });
  });
  const result = createWalletClient(() => "session", {
    onUnauthorized: () => {
      locked++;
    },
    retryDelayMs: 0,
  })["accounts.list"]();
  await expect(result).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  expect(locked).toBe(1);
  expect(calls).toBe(1);
});
test("successful non-JSON bodies produce a readable error without leaking HTML", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return new Response("<html>private upstream detail</html>");
  });
  await expect(createWalletClient(() => "session")["accounts.list"]()).rejects.toThrow(/non-JSON/i);
  expect(calls).toBe(1);
});
test("GET retries a transient response once and reads the current token again", async () => {
  let calls = 0;
  const tokens: string[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    tokens.push(new Headers(init.headers).get("Authorization")!);
    calls++;
    return calls === 1 ? new Response("unavailable", { status: 503 }) : envelope([]);
  });
  await expect(
    createWalletClient(() => `session-${calls + 1}`, { retryDelayMs: 0 })["accounts.list"](),
  ).resolves.toEqual([]);
  expect(calls).toBe(2);
  expect(tokens).toEqual(["Bearer session-1", "Bearer session-2"]);
});
test("GET retries transport errors once and stops after the second failure", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    throw new TypeError("Failed to fetch");
  });
  await expect(
    createWalletClient(() => "session", { retryDelayMs: 0 })["accounts.list"](),
  ).rejects.toThrow(/network/i);
  expect(calls).toBe(2);
});
test("mutations never retry an uncertain network failure", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    throw new TypeError("Failed to fetch");
  });
  await expect(
    createWalletClient(() => "session", { retryDelayMs: 0 })["accounts.delete"]({ params: { id } }),
  ).rejects.toThrow(/network/i);
  expect(calls).toBe(1);
});
test("GET does not retry validation errors and preserves the safe API message", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return Response.json(
      { data: null, error: { code: "VALIDATION_ERROR", message: "Choose a valid account" } },
      { status: 422 },
    );
  });
  await expect(createWalletClient(() => "session")["accounts.list"]()).rejects.toMatchObject({
    status: 422,
    code: "VALIDATION_ERROR",
    message: "Choose a valid account",
  });
  expect(calls).toBe(1);
});
test("aborting before a call sends nothing", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return envelope([]);
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    createWalletClient(() => "session")["accounts.list"]({ signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(0);
});
test("AbortSignal reaches fetch and an aborted request is not retried", async () => {
  const controller = new AbortController();
  let calls = 0;
  vi.stubGlobal("fetch", (_path: string, init: RequestInit) => {
    calls++;
    expect(init.signal).toBe(controller.signal);
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  });
  const pending = createWalletClient(() => "session")["accounts.list"]({
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
});
test("aborting during backoff prevents the retry", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const controller = new AbortController();
  vi.stubGlobal("fetch", async () => {
    calls++;
    return new Response("unavailable", { status: 503 });
  });
  const pending = createWalletClient(() => "session", { retryDelayMs: 250 })["accounts.list"]({
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await assertion;
  await vi.advanceTimersByTimeAsync(500);
  expect(calls).toBe(1);
});
test("request params and successful responses are checked against the contract", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return envelope([{ id: "bad" }]);
  });
  const client = createWalletClient(() => "session");
  await expect(client["accounts.delete"]({ params: { id: "not-a-uuid" } })).rejects.toThrow(
    /invalid request/i,
  );
  expect(calls).toBe(0);
  await expect(client["accounts.list"]()).rejects.toThrow(/invalid API response/i);
  expect(calls).toBe(1);
});
test("ingestion cannot reuse the browser session getter", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return envelope({ status: "ignored" });
  });
  await expect(
    createWalletClient(() => "session")["ingest.mailTransaction"]({ body: {} as never }),
  ).rejects.toThrow(/ingestion authentication/i);
  expect(calls).toBe(0);
});
test("body objects stay required even when their inner fields have defaults", () => {
  expectTypeOf<Parameters<WalletClient["wallet.bootstrap"]>[0]>().toMatchTypeOf<{
    body: unknown;
  }>();
  expectTypeOf<Parameters<WalletClient["settings.patch"]>[0]>().toMatchTypeOf<{
    body: unknown;
  }>();
  expectTypeOf<Parameters<WalletClient["accounts.patch"]>[0]>().toMatchTypeOf<{
    body: unknown;
    params: { id: string };
  }>();
  expectTypeOf<Parameters<WalletClient["records.list"]>[0]>().toEqualTypeOf<
    ClientInput<"records.list"> | undefined
  >();
});

test("401 identifies the session used by the failed request even after replacement", async () => {
  let token = "synthetic-session-A";
  let release!: (response: Response) => void;
  const unauthorized = vi.fn();
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const pending = createWalletClient(() => token, { onUnauthorized: unauthorized })[
    "accounts.list"
  ]();
  const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
  token = "synthetic-session-B";
  release(new Response(null, { status: 401 }));
  await rejected;
  expect(unauthorized).toHaveBeenCalledWith("synthetic-session-A");
});
