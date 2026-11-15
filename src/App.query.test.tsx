// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import App from "./App";
import { boot, reference, record, id } from "./test/wallet-fixtures";

const server = setupServer();
const response = (data: unknown) => HttpResponse.json({ data, error: null });
const refs = {
  ...reference,
  accounts: [
    {
      id,
      name: "Synthetic account",
      type: "bank",
      currency: "UYU",
      initialBalance: 1000,
      color: "blue",
      icon: "bank",
      isVisible: true,
      isActive: true,
    },
  ],
  categories: [{ id, name: "Synthetic category", color: "blue", icon: "tag" }],
};
let bootstraps: number, snapshots: number;
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  bootstraps = 0;
  snapshots = 0;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("wallet-session-token", "synthetic-app-query");
  localStorage.setItem("wallet-session-expires-at", new Date(Date.now() + 60_000).toISOString());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => {
      bootstraps++;
      return response({ ...boot, reference: refs });
    }),
    http.post("http://test.local/api/wallet/bootstrap", () => {
      snapshots++;
      return response({
        dataset: {},
        recordsPage: { hasMore: false, nextCursor: null },
        generatedDebts: [],
        serverDate: "2026-11-14",
      });
    }),
    http.get("http://test.local/api/wallet", () => {
      snapshots++;
      return response({});
    }),
    http.get("http://test.local/api/wallet/reference", () => response(refs)),
    http.get("http://test.local/api/records", () =>
      response({ items: [record], hasMore: false, nextCursor: null }),
    ),
    http.get("http://test.local/api/cards/agenda", () => response([])),
    http.get("http://test.local/api/analytics/accounts", () =>
      response([
        {
          accountId: id,
          balance: 970,
          totalBalance: 970,
          reserved: 0,
          freeBalance: 970,
          balanceInPrimary: 970,
          totalBalanceInPrimary: 970,
        },
      ]),
    ),
  );
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

test("the active app boots reference and paginated Records without requesting the legacy snapshot", async () => {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={["/records"]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
  await screen.findByText("Synthetic category", {}, { timeout: 3000 });
  expect(bootstraps).toBe(1);
  expect(snapshots).toBe(0);
  expect(localStorage.getItem("wallet-dataset-cache")).toBeNull();
});
