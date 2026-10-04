import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "@shared/mock-data";
import type { RecordFilters } from "@shared/types";
import { GlobalSearch } from "./global-search";
import { AppShell } from "../layout/app-shell";

const state = vi.hoisted(() => ({
  dataset: {} as typeof mockWalletData,
  filters: {} as RecordFilters,
  period: "month",
  writes: vi.fn(),
  draft: vi.fn(),
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset: state.dataset,
    selectedMonth: "2026-10",
    selectedPeriodMode: state.period,
    customDateRange: { from: "2026-10-01", to: "2026-10-03" },
    setSelectedMonth: vi.fn(),
    setCustomDateRange: vi.fn(),
    isAllHistoryComplete: false,
    clearRecordFilters: () => {
      state.filters = { type: "all" };
    },
    setRecordFilters: (filters: RecordFilters) => {
      state.filters = { ...state.filters, ...filters };
    },
    setAllPeriod: () => {
      state.period = "all";
    },
    requestNewRecord: state.draft,
    addRecord: state.writes,
    payDebt: state.writes,
    addCreditCardPayment: state.writes,
  }),
}));
// React test renderer has no DOM portal. Keep component state and handlers real;
// exercise the Dialog focus callbacks at the boundary owned by this component.
vi.mock("@/components/ui/dialog", () => {
  const part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ children, ...props }: { children: ReactNode }) => (
      <div data-dialog-root {...props}>
        {children}
      </div>
    ),
    DialogTrigger: part,
    DialogHeader: part,
    DialogTitle: part,
    DialogDescription: part,
    DialogContent: ({ children, ...props }: { children: ReactNode }) => (
      <div data-dialog-content {...props}>
        {children}
      </div>
    ),
  };
});
let tree: ReactTestRenderer | undefined;
let events: EventTarget;
let priorFocus: { focus: ReturnType<typeof vi.fn>; isConnected: boolean };
function Location() {
  return <output>{useLocation().pathname}</output>;
}
function button(label: string) {
  return tree!.root
    .findAllByType("button")
    .find(
      (node) =>
        node.props["aria-label"] === label ||
        node.children.includes(label) ||
        node
          .findAllByType("span")
          .some((span) => span.children.includes(label)),
    )!;
}
async function mount(shell = false) {
  await act(async () => {
    tree = create(
      <MemoryRouter>
        {shell ? (
          <AppShell>
            <Location />
          </AppShell>
        ) : (
          <>
            <GlobalSearch />
            <Location />
          </>
        )}
      </MemoryRouter>,
    );
  });
}
async function open() {
  await act(async () => button("Search wallet").props.onClick());
}
async function query(value: string) {
  await act(async () =>
    tree!.root.findByType("input").props.onChange({ target: { value } }),
  );
}
async function shortcut(props: Partial<KeyboardEvent> = {}) {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, {
    key: "k",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    ...props,
  });
  await act(async () => {
    events.dispatchEvent(event);
  });
  return event;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  events = new EventTarget();
  priorFocus = { focus: vi.fn(), isConnected: true };
  vi.stubGlobal("window", events);
  vi.stubGlobal("document", { activeElement: priorFocus });
  state.dataset = structuredClone(mockWalletData);
  state.filters = {
    search: "old",
    categoryId: "old",
    tagId: "old",
    accountId: "old",
    goalId: "old",
    paymentStatus: "cancelled",
  };
  state.period = "month";
  vi.clearAllMocks();
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

test("the persistent header exposes search; Ctrl/Cmd K toggles it and unmount removes the shortcut", async () => {
  await mount(true);
  expect(button("Search wallet")).toBeDefined();
  expect(tree!.root.findAllByType("input")).toHaveLength(0);
  expect((await shortcut()).defaultPrevented).toBe(true);
  expect(tree!.root.findAllByType("input")).toHaveLength(1);
  await query("first query");
  await shortcut({ ctrlKey: false, metaKey: true });
  expect(tree!.root.findAllByType("input")).toHaveLength(0);
  await shortcut();
  expect(tree!.root.findByType("input").props.value).toBe("");
  await act(async () => tree!.unmount());
  tree = undefined;
  expect((await shortcut()).defaultPrevented).toBe(false);
});

test("composing, repeated and ordinary text keys do not open search or navigate", async () => {
  await mount();
  for (const props of [
    { isComposing: true },
    { repeat: true },
    { altKey: true },
    { ctrlKey: false },
    { key: "a" },
  ]) {
    expect((await shortcut(props)).defaultPrevented).toBe(false);
  }
  expect(tree!.root.findAllByType("input")).toHaveLength(0);
  expect(tree!.root.findByType("output").children).toEqual(["/"]);
});

test("account and category selections clear stale filters and open their all-history records", async () => {
  state.dataset.accounts[0] = {
    ...state.dataset.accounts[0],
    name: "Unique account",
    isVisible: true,
    isActive: true,
  };
  state.dataset.categories[0].name = "Unique category";
  await mount();
  await open();
  await query("unique account");
  await act(async () => button("Unique account").props.onClick());
  expect(state.filters).toEqual({
    type: "all",
    accountId: state.dataset.accounts[0].id,
  });
  expect(state.period).toBe("all");
  expect(tree!.root.findByType("output").children).toEqual(["/records"]);
  await open();
  await query("unique category");
  await act(async () => button("Unique category").props.onClick());
  expect(state.filters).toEqual({
    type: "all",
    categoryId: state.dataset.categories[0].id,
  });
  expect(state.writes).not.toHaveBeenCalled();
});

test("text search and the review command replace unrelated filters without claiming complete counts", async () => {
  await mount();
  await open();
  await query("  café  ");
  await act(async () => button("Search records for “café”").props.onClick());
  expect(state.filters).toEqual({ type: "all", search: "café" });
  expect(state.period).toBe("all");
  await open();
  expect(JSON.stringify(tree!.toJSON())).toContain("may be incomplete");
  await act(async () => button("Review records").props.onClick());
  expect(state.filters).toEqual({ type: "all", paymentStatus: "needs_review" });
  expect(state.writes).not.toHaveBeenCalled();
});

test("entity selection uses detail routes and New record only opens a draft", async () => {
  state.dataset.creditCards = [
    {
      ...state.dataset.creditCards[0],
      id: "card-one",
      name: "Unique card",
      isActive: true,
    },
  ];
  await mount();
  await open();
  await query("unique card");
  await act(async () => button("Unique card").props.onClick());
  expect(tree!.root.findByType("output").children).toEqual(["/cards/card-one"]);
  await open();
  await act(async () => button("New record").props.onClick());
  expect(tree!.root.findByType("output").children).toEqual(["/records"]);
  expect(state.draft).toHaveBeenCalledTimes(1);
  expect(state.writes).not.toHaveBeenCalled();
});

test("dialog focus callbacks focus its input and restore prior focus on closure", async () => {
  const inputFocus = vi.fn();
  await mount();
  await open();
  const event = { preventDefault: vi.fn() };
  // Node mocks emulate the DOM refs without introducing a browser dependency.
  await act(async () => {
    tree!.unmount();
    tree = create(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>,
      {
        createNodeMock: (node) =>
          node.type === "input" ? { focus: inputFocus } : null,
      },
    );
  });
  await open();
  const content = tree!.root.findByProps({ "data-dialog-content": true }).props;
  content.onOpenAutoFocus(event);
  expect(inputFocus).toHaveBeenCalledTimes(1);
  await act(async () =>
    tree!.root
      .findByProps({ "data-dialog-root": true })
      .props.onOpenChange(false),
  );
  content.onCloseAutoFocus(event);
  expect(priorFocus.focus).toHaveBeenCalledTimes(1);
});
