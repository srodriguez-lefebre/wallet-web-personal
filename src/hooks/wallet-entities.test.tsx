// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { StrictMode, type ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";

import { AuthProvider } from "../providers/auth-provider";
import {
  WalletQueryProvider,
  useWalletBootstrap,
  useWalletData,
} from "../providers/wallet-query-provider";
import { boot, reference, record, id } from "../test/wallet-fixtures";
import {
  useAccounts,
  useCard,
  useCards,
  useGoals,
  useRecords,
  useWalletReferenceQuery,
} from "./wallet-entities";

const goalId = "00000000-0000-4000-8000-000000000002";
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
  recordSummary: { ...reference.recordSummary, total: 2 },
  goals: [
    {
      id: goalId,
      name: "Synthetic goal",
      targetAmount: 1000,
      currency: "UYU",
      color: "blue",
      icon: "flag",
      isVisible: true,
      status: "active",
      autoCaptureEnabled: false,
      tagIds: [],
    },
  ],
};
const server = setupServer();
let amount: number, bootstrapReads: number, pageReads: number, snapshotReads: number;
const response = (value: unknown) => HttpResponse.json({ data: value, error: null });
function Probe() {
  const accounts = useAccounts(),
    goals = useGoals(),
    records = useRecords();
  const update = (value: number) =>
    void records.mutations["records.patch"]({ params: { id }, body: { amount: value } });
  return (
    <>
      <p>
        {accounts.balances[0]?.balance}:{goals.progress[0]?.spent}:{records.records[0]?.amount}:
        {records.records.length}
      </p>
      <button onClick={() => update(30)}>Edit expense</button>
      <button onClick={() => update(10)}>Undo expense</button>
    </>
  );
}
function Gate({ children }: { children: ReactNode }) {
  const boot = useWalletBootstrap();
  return boot.isSuccess ? children : <p>Loading</p>;
}
function mount(view: ReactNode = <Probe />) {
  return render(
    <StrictMode>
      <AuthProvider>
        <WalletQueryProvider>
          <Gate>{view}</Gate>
        </WalletQueryProvider>
      </AuthProvider>
    </StrictMode>,
  );
}
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  amount = 10;
  bootstrapReads = 0;
  pageReads = 0;
  snapshotReads = 0;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("wallet-session-token", "synthetic-query-entities");
  localStorage.setItem("wallet-session-expires-at", new Date(Date.now() + 60_000).toISOString());
  const visible = () => ({
    ...record,
    amount,
    goalIds: [goalId],
    goalAssociations: [
      { goalId, assignmentSource: "manual", useReserved: false, reserveIncome: true },
    ],
  });
  const page = () => ({ items: [visible()], nextCursor: "synthetic-older-page", hasMore: true });
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => {
      bootstrapReads++;
      return response({ ...boot, reference: refs, recordsPage: page() });
    }),
    http.get("http://test.local/api/wallet/reference", () => response(refs)),
    http.get("http://test.local/api/records", () => {
      pageReads++;
      return response(page());
    }),
    http.get("http://test.local/api/wallet", () => {
      snapshotReads++;
      return response({});
    }),
    http.get("http://test.local/api/analytics/accounts", () =>
      response([
        {
          accountId: id,
          balance: 980 - amount,
          totalBalance: 980 - amount,
          reserved: 0,
          freeBalance: 980 - amount,
          balanceInPrimary: 980 - amount,
          totalBalanceInPrimary: 980 - amount,
        },
      ]),
    ),
    http.get("http://test.local/api/analytics/goals", () =>
      response([
        {
          goalId,
          hasMissingExchangeRate: false,
          reserved: 0,
          spent: 20 + amount,
          committed: 20 + amount,
          remaining: 980 - amount,
          overTarget: 0,
          percentage: (20 + amount) / 10,
        },
      ]),
    ),
    http.patch(`http://test.local/api/records/${id}`, async ({ request }) => {
      amount = ((await request.json()) as { amount: number }).amount;
      return response(visible());
    }),
  );
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

test("entity hooks retain the seeded page and update complete balances and goals across edit, reload and undo", async () => {
  const first = mount();
  await screen.findByText("970:30:10:1");
  expect(bootstrapReads).toBe(1);
  expect(pageReads).toBe(0);
  fireEvent.click(screen.getByText("Edit expense"));
  await screen.findByText("950:50:30:1");
  expect(pageReads).toBe(1);
  expect(snapshotReads).toBe(0);
  first.unmount();
  mount();
  await screen.findByText("950:50:30:1");
  expect(bootstrapReads).toBe(2);
  fireEvent.click(screen.getByText("Undo expense"));
  await screen.findByText("970:30:10:1");
  await waitFor(() => expect(pageReads).toBe(2));
  expect(snapshotReads).toBe(0);
  expect(localStorage.getItem("wallet-dataset-cache")).toBeNull();
});

test("Cards shares summary reads, retains archived cards and refreshes only affected entity caches", async () => {
  const cardId = "00000000-0000-4000-8000-000000000004";
  let limit = 1000,
    theme = "system";
  const summarySignals: AbortSignal[] = [],
    ledgerSignals: AbortSignal[] = [];
  const summaryReads = () => summarySignals.filter((signal) => !signal.aborted).length;
  const ledgerReads = () => ledgerSignals.filter((signal) => !signal.aborted).length;
  const card = () => ({
    id: cardId,
    name: "Synthetic archived card",
    issuer: "Synthetic bank",
    lastFour: "1234",
    creditLimit: limit,
    limitCurrency: "UYU",
    closingDay: 20,
    dueDay: 5,
    color: "blue",
    icon: "card",
    isActive: false,
  });
  const cardReference = () => ({
    ...refs,
    settings: { ...refs.settings, theme },
    creditCards: [card()],
  });
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () => {
      bootstrapReads++;
      return response({ ...boot, reference: cardReference() });
    }),
    http.get("http://test.local/api/wallet/reference", () => response(cardReference())),
    http.get(`http://test.local/api/cards/${cardId}/summary`, ({ request }) => {
      summarySignals.push(request.signal);
      return response({
        card: card(),
        usedLimit: 100,
        availableLimit: limit - 100,
        utilizationPercent: (100 / limit) * 100,
        currentCycleStart: "2026-11-01",
        currentCycleEnd: "2026-11-30",
        lastClosingDate: "2026-10-31",
        dueDate: "2026-12-05",
        currentCycle: [],
        outstanding: [{ currency: "UYU", amount: 100 }],
        statementDue: [],
        status: "ok",
      });
    }),
    http.get(`http://test.local/api/cards/${cardId}/category-usage`, () => response([])),
    http.get(`http://test.local/api/cards/${cardId}/ledger`, ({ request }) => {
      ledgerSignals.push(request.signal);
      return response({
        creditCardRecords: [],
        creditCardStatements: [],
        creditCardPayments: [],
        creditCardPaymentAllocations: [],
      });
    }),
    http.get("http://test.local/api/cards/agenda", () => response([])),
    http.patch("http://test.local/api/settings", () => {
      theme = "dark";
      return response({ ...refs.settings, theme });
    }),
    http.patch(`http://test.local/api/cards/${cardId}`, () => {
      limit = 2000;
      return response(card());
    }),
  );
  function CardsProbe() {
    const cards = useCards(),
      detail = useCard(cardId),
      reference = useWalletReferenceQuery(),
      { mutations } = useWalletData();
    return (
      <>
        <p>
          {reference.data?.settings.theme}:{cards.entries[0]?.summary.usedLimit}:
          {detail.summary.data?.availableLimit}:{detail.ledger.data?.creditCardRecords.length}:
          {String(detail.card?.isActive)}
        </p>
        <button onClick={() => void mutations["settings.patch"]({ body: { theme: "dark" } })}>
          Change theme
        </button>
        <button
          onClick={() =>
            void cards.mutations["cards.patch"]({
              params: { id: cardId },
              body: { creditLimit: 2000 },
            })
          }
        >
          Change limit
        </button>
      </>
    );
  }
  mount(<CardsProbe />);
  await screen.findByText("system:100:900:0:false");
  expect(bootstrapReads).toBe(1);
  expect(summaryReads()).toBe(1);
  expect(ledgerReads()).toBe(1);
  fireEvent.click(screen.getByText("Change theme"));
  await screen.findByText("dark:100:900:0:false");
  expect(summaryReads()).toBe(1);
  expect(ledgerReads()).toBe(1);
  fireEvent.click(screen.getByText("Change limit"));
  await screen.findByText("dark:100:1900:0:false");
  await waitFor(() => expect(ledgerReads()).toBe(2));
  expect(summaryReads()).toBe(2);
  expect(pageReads).toBe(0);
  expect(snapshotReads).toBe(0);
});
