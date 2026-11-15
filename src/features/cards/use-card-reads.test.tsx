// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";

import { AuthProvider } from "../../providers/auth-provider";
import { WalletQueryProvider, useWalletBootstrap } from "../../providers/wallet-query-provider";
import { boot, reference, id } from "../../test/wallet-fixtures";
import { useCardReads } from "./use-card-reads";

const card = {
  id,
  name: "Synthetic card",
  issuer: "Synthetic bank",
  lastFour: "1234",
  creditLimit: 1000,
  limitCurrency: "UYU",
  closingDay: 20,
  dueDay: 5,
  color: "blue",
  icon: "card",
  isActive: true,
};
const refs = { ...reference, creditCards: [card] };
const selection = {
  from: "2026-11-01",
  to: "2026-11-30",
  selectedMonth: "2026-11",
  periodMode: "month" as const,
  timeZone: "America/Montevideo",
};
const server = setupServer();
const response = (data: unknown) => HttpResponse.json({ data, error: null });
let refreshes: number, reads: number;
function Probe() {
  const value = useCardReads(selection);
  return (
    <>
      <p>
        {value.refreshError ||
          (value.isPending ? "Loading cards" : `${value.entries.length} cards ready`)}
      </p>
      <button onClick={value.retryRefresh}>Retry cards</button>
    </>
  );
}
function Gate() {
  return useWalletBootstrap().isSuccess ? <Probe /> : <p>Loading</p>;
}
function mount() {
  render(
    <StrictMode>
      <AuthProvider>
        <WalletQueryProvider>
          <Gate />
        </WalletQueryProvider>
      </AuthProvider>
    </StrictMode>,
  );
}
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  refreshes = 0;
  reads = 0;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("wallet-session-token", "synthetic-card-refresh");
  localStorage.setItem("wallet-session-expires-at", new Date(Date.now() + 60000).toISOString());
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () =>
      response({ ...boot, reference: refs }),
    ),
    http.get("http://test.local/api/wallet/reference", () => response(refs)),
    http.get(`http://test.local/api/cards/${id}/summary`, () => {
      reads++;
      return response({
        card,
        usedLimit: 100,
        availableLimit: 900,
        utilizationPercent: 10,
        currentCycleStart: "2026-10-21",
        currentCycleEnd: "2026-11-20",
        lastClosingDate: "2026-10-20",
        dueDate: "2026-11-05",
        currentCycle: [],
        outstanding: [{ currency: "UYU", amount: 100 }],
        statementDue: [],
        status: "ok",
      });
    }),
    http.get(`http://test.local/api/cards/${id}/category-usage`, () => {
      reads++;
      return response([{ id: "uncategorized", name: "Uncategorized", color: "blue", amount: 100 }]);
    }),
    http.get("http://test.local/api/cards/agenda", () => {
      reads++;
      return response([]);
    }),
    http.get("http://test.local/api/analytics/details", () => {
      reads++;
      return response({
        monthlySeries: [],
        expenseTrend: [],
        expenseSequenceTrend: [],
        previousTotals: { income: 0, expenses: 0, cashFlow: 0 },
        currentMonthTotals: { income: 0, expenses: 0, cashFlow: 0 },
        averageMonthlyExpenses: 0,
        expenseMonths: [],
        merchants: [],
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

test("Cards refreshes once in StrictMode before loading its complete derived reads", async () => {
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("http://test.local/api/cards/refresh-statements", async () => {
      refreshes++;
      started();
      await blocked;
      return response({ refreshed: true });
    }),
  );
  mount();
  await entered;
  expect(refreshes).toBe(1);
  expect(reads).toBe(0);
  release();
  await screen.findByText("1 cards ready");
  expect(refreshes).toBe(1);
  expect(reads).toBe(4);
});

test("a failed derived refresh waits for an explicit retry and never loads partial card data", async () => {
  server.use(
    http.post("http://test.local/api/cards/refresh-statements", () => {
      refreshes++;
      return refreshes === 1
        ? HttpResponse.json(
            { data: null, error: { code: "TEMPORARY", message: "Synthetic refresh unavailable" } },
            { status: 500 },
          )
        : response({ refreshed: true });
    }),
  );
  mount();
  await screen.findByText("Synthetic refresh unavailable");
  expect(refreshes).toBe(1);
  expect(reads).toBe(0);
  fireEvent.click(screen.getByText("Retry cards"));
  await screen.findByText("1 cards ready");
  expect(refreshes).toBe(2);
  expect(reads).toBe(4);
});
