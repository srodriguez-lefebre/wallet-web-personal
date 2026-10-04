import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../../shared/mock-data";
import { budgetSchema } from "../../../shared/schemas";
import type { Budget, WalletDataset } from "../../../shared/types";
import { BudgetAssistant } from "./budget-assistant";

const food = "10000000-0000-4000-8000-000000000001";
const travel = "10000000-0000-4000-8000-000000000002";
let server: WalletDataset;
let writes: Omit<Budget, "id">[];
let reads: number;
let failRead: boolean;
let failCategory: string | undefined;
let commitBeforeFailure: boolean;
let holdWrite: (() => Promise<void>) | undefined;

vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    getCompleteDataset: async () => {
      reads += 1;
      if (failRead) throw new Error("Refresh unavailable");
      const snapshot = structuredClone(server);
      Object.freeze(snapshot.budgets);
      return snapshot;
    },
    addBudget: async (value: Omit<Budget, "id">) => {
      const valid = budgetSchema.parse(value);
      writes.push(valid);
      if (holdWrite) await holdWrite();
      if (failCategory === valid.categoryId) {
        if (commitBeforeFailure)
          server.budgets.push({ ...valid, id: `saved-${valid.categoryId}` });
        throw new Error("Budget save interrupted");
      }
      server.budgets.push({ ...valid, id: `saved-${valid.categoryId}` });
      return `saved-${valid.categoryId}`;
    },
  }),
}));
let tree: ReactTestRenderer | undefined;
const text = () =>
  tree!.root
    .findAllByType("p")
    .map((node) =>
      node.children.filter((child) => typeof child === "string").join(""),
    )
    .join(" ") +
  tree!.root
    .findAllByType("button")
    .map((node) => node.children.join(""))
    .join(" ");
const button = (label: string) =>
  tree!.root
    .findAllByType("button")
    .find((node) => node.children.includes(label))!;
async function mount() {
  await act(async () => {
    tree = create(<BudgetAssistant initialMonth="2026-02" />);
  });
}
async function save(label = "Create selected budgets") {
  await act(async () => {
    await button(label).props.onClick();
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 3, 12));
  writes = [];
  reads = 0;
  failRead = false;
  failCategory = undefined;
  commitBeforeFailure = false;
  holdWrite = undefined;
  server = structuredClone(mockWalletData);
  server.settings.primaryCurrency = "UYU";
  server.settings.includeHiddenAccountsInReports = true;
  server.budgets = [];
  server.categories = [
    { id: food, name: "Food", color: "#123456", icon: "utensils" },
    { id: travel, name: "Travel", color: "#654321", icon: "plane" },
  ];
  server.records = [food, travel].map((categoryId, index) => ({
    ...server.records[0],
    id: String(index),
    type: "expense",
    amount: 100.01,
    currency: "UYU",
    exchangeRateToPrimary: 1,
    categoryId,
    paymentStatus: "cleared",
    occurredAt: "2026-01-15T12:00:00Z",
  }));
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("loads complete history, explains monthly scope and saves edited chosen proposals with valid payloads", async () => {
  await mount();
  expect(reads).toBe(1);
  expect(text()).toContain("2025-11");
  expect(text()).toContain("2026-01");
  expect(text()).toContain("apply every month");
  await act(async () => {
    tree!.root
      .findByProps({ "aria-label": "Limit for Food" })
      .props.onChange({ target: { value: "55.25" } });
    tree!.root
      .findByProps({ "aria-label": "Select Travel" })
      .props.onChange({ target: { checked: false } });
  });
  await save();
  expect(reads).toBe(2);
  expect(server.budgets).toHaveLength(1);
  expect(server.budgets[0]).toMatchObject({
    categoryId: food,
    limitAmount: 55.25,
    period: "monthly",
    currency: "UYU",
    isActive: true,
  });
  expect(server.budgets[0].accountId).toBeUndefined();
  expect(text()).toContain("1 confirmed");
});

test("single flight prevents a second write batch even before React disables the save button", async () => {
  await mount();
  let release!: () => void;
  holdWrite = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const click = button("Create selected budgets").props.onClick;
  let first!: Promise<void>;
  await act(async () => {
    first = click();
    void click();
  });
  expect(writes).toHaveLength(1);
  expect(button("Saving…").props.disabled).toBe(true);
  await act(async () => {
    holdWrite = undefined;
    release();
    await first;
  });
  expect(server.budgets).toHaveLength(2);
  expect(reads).toBe(2);
  expect(text()).toContain("2 confirmed");
});

test("stops at the first failure, reports confirmed and uncertain saves, and reconciles before retry", async () => {
  failCategory = travel;
  commitBeforeFailure = true;
  await mount();
  await save();
  expect(writes).toHaveLength(2);
  expect(text()).toContain("1 confirmed");
  expect(text()).toContain("Save outcome uncertain");
  expect(text()).toContain("Reconcile and retry");
  failCategory = undefined;
  await save("Reconcile and retry");
  expect(writes).toHaveLength(2);
  expect(reads).toBe(3);
  expect(server.budgets).toHaveLength(2);
  expect(text()).toContain("1 reconciled");
});

test("retry writes only unsaved selections after a rejected create that did not persist", async () => {
  failCategory = travel;
  await mount();
  await save();
  failCategory = undefined;
  await save("Reconcile and retry");
  expect(writes.map((value) => value.categoryId)).toEqual([
    food,
    travel,
    travel,
  ]);
  expect(server.budgets).toHaveLength(2);
  expect(text()).toContain("2 confirmed");
});

test("refresh failure prevents writes, including a retry with an uncertain prior save", async () => {
  failCategory = food;
  commitBeforeFailure = true;
  await mount();
  await save();
  expect(writes).toHaveLength(1);
  failRead = true;
  await save("Reconcile and retry");
  expect(writes).toHaveLength(1);
  expect(text()).toContain("Refresh unavailable");
  failRead = false;
  failCategory = undefined;
  await save("Reconcile and retry");
  expect(writes.map((value) => value.categoryId)).toEqual([food, travel]);
  expect(server.budgets).toHaveLength(2);
});

test("fresh active conflicts in different currencies and hidden scopes skip writes without overwriting", async () => {
  await mount();
  server.budgets = [
    {
      ...mockWalletData.budgets[0],
      id: "other",
      categoryId: food,
      currency: "USD",
      accountId: "hidden",
      isActive: true,
    },
  ];
  await save();
  expect(writes.map((value) => value.categoryId)).toEqual([travel]);
  expect(server.budgets[0].currency).toBe("USD");
  expect(text()).toContain("Existing active budget");
});

test("blocks invalid edited limits and recalculates after changing the month or margin", async () => {
  await mount();
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Limit for Food" })
      .props.onChange({ target: { value: "0" } }),
  );
  expect(button("Create selected budgets").props.disabled).toBe(true);
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Margin percent" })
      .props.onChange({ target: { value: "0" } }),
  );
  expect(
    tree!.root.findByProps({ "aria-label": "Limit for Food" }).props.value,
  ).toBe("33.34");
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Target month" })
      .props.onChange({ target: { value: "2025-12" } }),
  );
  expect(text()).toContain("No eligible category expenses");
});

test("initial load failure shows a retry and waits for full history before offering proposals", async () => {
  failRead = true;
  await mount();
  expect(text()).toContain("Refresh unavailable");
  expect(
    tree!.root.findAllByProps({ "aria-label": "Limit for Food" }),
  ).toHaveLength(0);
  failRead = false;
  await act(async () => {
    await button("Retry loading history").props.onClick();
  });
  expect(reads).toBe(2);
  expect(
    tree!.root.findByProps({ "aria-label": "Limit for Food" }).props.value,
  ).toBe("36.68");
});

test("preexisting budgets and missing frozen FX disable the affected proposals", async () => {
  server.budgets = [
    {
      ...mockWalletData.budgets[0],
      id: "already",
      categoryId: food,
      currency: "USD",
      isActive: true,
    },
  ];
  server.records[1].currency = "USD";
  server.records[1].exchangeRateToPrimary = 0;
  await mount();
  expect(
    tree!.root.findByProps({ "aria-label": "Select Food" }).props.disabled,
  ).toBe(true);
  expect(
    tree!.root.findByProps({ "aria-label": "Select Travel" }).props.disabled,
  ).toBe(true);
  expect(text()).toContain("Historical exchange rate unavailable");
  expect(text()).toContain("Existing active budget");
  expect(button("Create selected budgets").props.disabled).toBe(true);
});

test("changing primary currency before save requires reloading proposals and causes no write", async () => {
  await mount();
  server.settings.primaryCurrency = "USD";
  await save();
  expect(writes).toHaveLength(0);
  expect(text()).toContain("Primary currency changed");
});

test("caps the target month at the current month and explains excluded direct card activity", async () => {
  await mount();
  const month = tree!.root.findByProps({ "aria-label": "Target month" });
  expect(month.props.max).toBe("2026-10");
  expect(text()).toContain(
    "Direct card purchases without a wallet record are excluded",
  );
  await act(async () => month.props.onChange({ target: { value: "2026-11" } }));
  expect(
    tree!.root.findAllByProps({ "aria-label": "Limit for Food" }),
  ).toHaveLength(0);
  expect(text()).toContain("complete");
  expect(button("Create selected budgets").props.disabled).toBe(true);
});
