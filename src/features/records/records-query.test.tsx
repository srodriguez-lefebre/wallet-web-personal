// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { type PropsWithChildren } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";

import { RecordsView } from "./RecordsView";

import { useAccounts, useGoals } from "@/hooks/wallet-entities";
import { AuthProvider } from "@/providers/auth-provider";
import { WalletQueryProvider, useWalletBootstrap } from "@/providers/wallet-query-provider";
import { WalletUIProvider } from "@/providers/wallet-ui-provider";
import { boot, reference, record, id } from "@/test/wallet-fixtures";

const goalId = "00000000-0000-4000-8000-000000000002";
const refs = {
  ...reference,
  accounts: [
    {
      id,
      name: "Synthetic bank",
      type: "bank",
      currency: "UYU",
      initialBalance: 1000,
      color: "#2563eb",
      icon: "bank",
      isVisible: true,
      isActive: true,
    },
  ],
  categories: [{ id, name: "Synthetic food", color: "#2563eb", icon: "tag" }],
  goals: [
    {
      id: goalId,
      name: "Synthetic goal",
      targetAmount: 1000,
      currency: "UYU",
      color: "#2563eb",
      icon: "flag",
      isVisible: true,
      status: "active",
      autoCaptureEnabled: false,
      tagIds: [],
    },
  ],
  recordSummary: { ...reference.recordSummary, total: 2, review: 41 },
};
const server = setupServer();
const response = (data: unknown) => HttpResponse.json({ data, error: null });
let amount: number, writes: unknown[], snapshots: number, updatedAt: string;
const visible = () => ({
  ...record,
  amount,
  accountAmount: amount,
  counterpartyName: "Synthetic visible expense",
  updatedAt,
  goalIds: [goalId],
  goalAssociations: [
    { goalId, assignmentSource: "manual", useReserved: false, reserveIncome: true },
  ],
});
const page = () => ({ items: [visible()], hasMore: true, nextCursor: "synthetic-older-records" });
function Totals() {
  const accounts = useAccounts(),
    goals = useGoals();
  return (
    <output aria-label="Canonical totals">
      {accounts.balances[0]?.balance}:{goals.progress[0]?.spent}
    </output>
  );
}
function Gate({ children }: PropsWithChildren) {
  const bootstrap = useWalletBootstrap();
  return bootstrap.isSuccess ? (
    <WalletUIProvider initialMonth="2026-11">{children}</WalletUIProvider>
  ) : (
    <p>Loading synthetic wallet</p>
  );
}
function mount() {
  return render(
    <AuthProvider>
      <WalletQueryProvider>
        <Gate>
          <RecordsView />
          <Totals />
        </Gate>
      </WalletQueryProvider>
    </AuthProvider>,
  );
}
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  amount = 10;
  writes = [];
  snapshots = 0;
  updatedAt = "2026-11-14T12:00:00.000Z";
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("wallet-session-token", "synthetic-record-form-session");
  localStorage.setItem("wallet-session-expires-at", new Date(Date.now() + 60_000).toISOString());
  server.use(
    http.post("http://test.local/api/wallet/bootstrap-reference", () =>
      response({ ...boot, reference: refs, recordsPage: page() }),
    ),
    http.get("http://test.local/api/wallet/reference", () => response(refs)),
    http.get("http://test.local/api/wallet", () => {
      snapshots++;
      return response({});
    }),
    http.get("http://test.local/api/records", () => response(page())),
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
      const body = (await request.json()) as { amount: number };
      writes.push(body);
      amount = body.amount;
      updatedAt = "2026-11-14T13:00:00.000Z";
      return response(visible());
    }),
  );
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
async function editExpense(value: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic visible expense/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
test("real expense form updates complete balance and goal, survives reload, and reverses with older history outside Records", async () => {
  const first = mount();
  await waitFor(() => expect(screen.getByLabelText("Canonical totals").textContent).toBe("970:30"));
  expect(screen.getByRole("button", { name: "Open review queue" }).textContent).toContain("41");
  expect(screen.getByText("1 record loaded")).toBeDefined();
  await editExpense("30");
  await waitFor(() => expect(screen.getByLabelText("Canonical totals").textContent).toBe("950:50"));
  first.unmount();
  mount();
  await waitFor(() => expect(screen.getByLabelText("Canonical totals").textContent).toBe("950:50"));
  await editExpense("10");
  await waitFor(() => expect(screen.getByLabelText("Canonical totals").textContent).toBe("970:30"));
  expect(writes).toHaveLength(2);
  expect(writes[0]).toMatchObject({ expectedUpdatedAt: "2026-11-14T12:00:00.000Z" });
  expect(snapshots).toBe(0);
  expect(localStorage.getItem("wallet-dataset-cache")).toBeNull();
});

test("a concurrent edit rejects the stale form without losing its amount or timestamp", async () => {
  server.use(
    http.patch(`http://test.local/api/records/${id}`, async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json(
        { data: null, error: { code: "CONFLICT", message: "Record changed in another window" } },
        { status: 409 },
      );
    }),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic visible expense/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "37" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await screen.findByText("Could not save record");
  expect(within(dialog).getByLabelText<HTMLInputElement>("Amount").value).toBe("37");
  expect(writes[0]).toMatchObject({ expectedUpdatedAt: updatedAt });
  expect(writes).toHaveLength(1);
});
