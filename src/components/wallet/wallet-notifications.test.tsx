import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "@shared/mock-data";
import type { RecordFilters } from "@shared/types";
import { WalletNotifications } from "./wallet-notifications";

const state = vi.hoisted(() => ({
  dataset: {} as typeof mockWalletData,
  complete: true,
  filters: {} as RecordFilters,
  period: "month",
  writes: vi.fn(),
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset: state.dataset,
    isAllHistoryComplete: state.complete,
    clearRecordFilters: () => {
      state.filters = { type: "all" };
    },
    setRecordFilters: (filters: RecordFilters) => {
      state.filters = { ...state.filters, ...filters };
    },
    setAllPeriod: () => {
      state.period = "all";
    },
    addRecord: state.writes,
    recordDebtPayment: state.writes,
    addCreditCardPayment: state.writes,
  }),
}));
// Test renderer cannot mount a DOM portal. Keep notification state and actions
// real while replacing the popover's DOM boundary.
vi.mock("@radix-ui/react-popover", () => {
  const Part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Root: Part, Trigger: Part, Portal: Part, Content: Part };
});

let tree: ReactTestRenderer | undefined;
function Location() {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.search}
    </output>
  );
}
function button(label: string) {
  return tree!.root
    .findAllByType("button")
    .find(
      (node) =>
        node.props["aria-label"] === label || node.children.join("") === label,
    )!;
}
async function mount() {
  await act(async () => {
    tree = create(
      <MemoryRouter>
        <WalletNotifications />
        <Location />
      </MemoryRouter>,
    );
  });
}
async function open() {
  await act(async () => button("Notifications").props.onClick());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  state.dataset = structuredClone(mockWalletData);
  state.dataset.records = [];
  state.dataset.debts = [];
  state.complete = true;
  state.filters = {
    accountId: "old",
    search: "old",
    categoryId: "old",
    paymentStatus: "cancelled",
  };
  state.period = "month";
  vi.clearAllMocks();
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("incomplete history withholds counts and actionable partial items", async () => {
  state.complete = false;
  state.dataset.records = [
    { ...mockWalletData.records[0], paymentStatus: "needs_review" },
  ];
  await mount();
  expect(
    tree!.root.findAllByProps({ "aria-label": "Pending notifications" }),
  ).toHaveLength(0);
  await open();
  expect(JSON.stringify(tree!.toJSON())).toContain("Loading complete history");
  expect(tree!.root.findAllByType("button")).toHaveLength(1);
  expect(JSON.stringify(tree!.toJSON())).not.toContain("No pending reviews");
});

test("review notification opens all-history queue and clears unrelated filters without writes", async () => {
  state.dataset.records = [
    {
      ...mockWalletData.records[0],
      occurredAt: "2020-01-01T12:00:00Z",
      paymentStatus: "needs_review",
    },
  ];
  await mount();
  expect(
    tree!.root.findByProps({ "aria-label": "Pending notifications" }).children,
  ).toEqual(["1"]);
  await open();
  await act(async () => button("Review 1 pending record").props.onClick());
  expect(state.filters).toEqual({ type: "all", paymentStatus: "needs_review" });
  expect(state.period).toBe("all");
  expect(tree!.root.findByType("output").children).toEqual(["/records"]);
  expect(state.writes).not.toHaveBeenCalled();
  expect(
    tree!.root.findAllByProps({ "aria-label": "Wallet notifications" }),
  ).toHaveLength(0);
});

test("counts overdue and due-soon visible debts and unpaid closed archived cards, and opens their destinations", async () => {
  const debt = {
    ...mockWalletData.debts[0],
    status: "active" as const,
    isVisible: true,
  };
  state.dataset.debts = [
    { ...debt, id: "overdue", name: "Old debt", dueAt: "2026-09-01" },
    { ...debt, id: "soon", name: "Soon debt", dueAt: "2026-10-10" },
    { ...debt, id: "later", name: "Later debt", dueAt: "2026-10-11" },
    {
      ...debt,
      id: "hidden",
      name: "Hidden debt",
      dueAt: "2026-09-01",
      isVisible: false,
    },
    {
      ...debt,
      id: "paid",
      name: "Paid debt",
      dueAt: "2026-09-01",
      status: "paid",
    },
  ];
  state.dataset.creditCards = [
    {
      id: "archived",
      name: "Archived card",
      issuer: "Bank",
      lastFour: "1234",
      creditLimit: 1000,
      limitCurrency: "UYU",
      closingDay: 20,
      dueDay: 1,
      color: "#2563EB",
      icon: "credit-card",
      isActive: false,
    },
  ];
  state.dataset.creditCardStatements = [
    {
      id: "closed",
      creditCardId: "archived",
      cycleStart: "2026-09-01",
      cycleEnd: "2026-09-20",
      closedAt: "2026-09-20",
      dueAt: "2026-10-01",
      status: "paid",
    },
  ];
  state.dataset.creditCardRecords = [
    {
      id: "purchase",
      creditCardId: "archived",
      statementId: "closed",
      kind: "purchase",
      amount: 50,
      currency: "UYU",
      amountInLimitCurrency: 50,
      exchangeRateToLimitCurrency: 1,
      categoryId: mockWalletData.categories[0].id,
      accountImpactAtCreation: false,
      occurredAt: "2026-09-10T12:00:00Z",
    },
  ];
  await mount();
  expect(
    tree!.root.findByProps({ "aria-label": "Pending notifications" }).children,
  ).toEqual(["3"]);
  await open();
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Later debt");
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Hidden debt");
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Paid debt");
  await act(async () => button("Open debt Old debt").props.onClick());
  expect(tree!.root.findByType("output").children).toEqual(["/debts"]);
  expect(state.filters).toEqual({ type: "all" });
  expect(state.period).toBe("all");
  await open();
  await act(async () => button("Open statement Archived card").props.onClick());
  expect(tree!.root.findByType("output").children.join("")).toBe(
    "/cards/archived?statementId=closed",
  );
  expect(state.writes).not.toHaveBeenCalled();
});

test("settled and empty information appears only inside the opened popover", async () => {
  await mount();
  expect(JSON.stringify(tree!.toJSON())).not.toContain(
    "All closed statements are settled",
  );
  expect(
    tree!.root.findAllByProps({ "aria-label": "Pending notifications" }),
  ).toHaveLength(0);
  await open();
  expect(JSON.stringify(tree!.toJSON())).toContain(
    "No pending reviews or debts due soon",
  );
  expect(JSON.stringify(tree!.toJSON())).toContain(
    "All closed statements are settled",
  );
});
