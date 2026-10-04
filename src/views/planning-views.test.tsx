import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { calculateGoalProgress, formatMoney } from "../../shared/calculations";
import type { WalletDataset } from "../../shared/types";
import { DebtsView } from "./debts-view";
import { InvestmentsView } from "./investments-view";
import { GoalFundingPlan } from "../components/wallet/goal-funding-plan";

const state = vi.hoisted(() => ({ dataset: undefined as unknown }));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({ dataset: state.dataset }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (action: () => Promise<unknown>) => action(),
  }),
}));
vi.mock("@/components/wallet/category-picker", () => ({
  CategoryPicker: () => null,
}));
vi.mock("@/components/ui/dialog", () => {
  const Part = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
      open ? <div>{children}</div> : null,
    DialogContent: Part,
    DialogDescription: Part,
    DialogHeader: Part,
    DialogTitle: Part,
    DialogTrigger: Part,
  };
});
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 21, 23, 59));
  state.dataset = structuredClone(mockWalletData);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const text = () => JSON.stringify(tree?.toJSON());

test("debt list puts undated amounts last and filters overdue without turning unknown balances into zero", async () => {
  const dataset = state.dataset as WalletDataset;
  const base = dataset.debts[0];
  dataset.debts = [
    {
      ...base,
      id: "undated",
      name: "Undated unknown",
      originalAmount: undefined,
      pendingAmount: undefined,
      dueAt: undefined,
      status: "active",
      isVisible: true,
    },
    {
      ...base,
      id: "today",
      name: "Today's debt",
      dueAt: "2026-06-21T00:00:00Z",
      status: "active",
      pendingAmount: 100,
    },
    {
      ...base,
      id: "overdue",
      name: "Old debt",
      dueAt: "2026-06-20T12:00:00Z",
      status: "active",
      pendingAmount: 100,
    },
  ];
  await act(async () => {
    tree = create(<DebtsView />);
  });
  expect(text().indexOf("Old debt")).toBeLessThan(
    text().indexOf("Today's debt"),
  );
  expect(text().indexOf("Today's debt")).toBeLessThan(
    text().indexOf("Undated unknown"),
  );
  expect(text()).toContain("Due today");
  expect(text()).toContain("Amount pending");
  await act(async () => {
    tree!.root
      .findAllByType("button")
      .find((node) => node.children.includes("Overdue"))!
      .props.onClick();
  });
  expect(text()).toContain("Old debt");
  expect(text()).not.toContain("Undated unknown");
  expect(text()).not.toContain("Today's debt");
});
test("when every debt amount is unknown, summary fields display pending instead of zero", async () => {
  const dataset = state.dataset as WalletDataset;
  dataset.debts = [
    {
      ...dataset.debts[0],
      pendingAmount: undefined,
      originalAmount: undefined,
      isVisible: true,
      status: "active",
    },
  ];
  await act(async () => {
    tree = create(<DebtsView />);
  });
  expect(text().match(/Amount pending/g)?.length).toBeGreaterThanOrEqual(4);
});
test("portfolio groups currencies and includes hidden investments only after the toggle", async () => {
  const dataset = state.dataset as WalletDataset;
  const base = dataset.investments[0];
  dataset.investments = [
    {
      ...base,
      id: "uyu",
      name: "Peso fund",
      currency: "UYU",
      amountInvested: 100,
      currentValue: 120,
      isVisible: true,
    },
    {
      ...base,
      id: "usd",
      name: "Dollar fund",
      currency: "USD",
      amountInvested: 10,
      currentValue: 12,
      isVisible: true,
    },
    {
      ...base,
      id: "hidden",
      name: "Hidden fund",
      currency: "USD",
      amountInvested: 90,
      currentValue: 100,
      isVisible: false,
    },
  ];
  await act(async () => {
    tree = create(<InvestmentsView />);
  });
  expect(text()).toContain("USD portfolio");
  expect(text()).toContain("UYU portfolio");
  expect(text()).not.toContain("Hidden fund");
  expect(text()).toContain(formatMoney(12, "USD"));
  await act(async () => {
    tree!.root
      .findByProps({ "aria-label": "Show hidden investments" })
      .props.onClick();
  });
  expect(text()).toContain("Hidden fund");
  expect(text()).toContain(formatMoney(112, "USD"));
  expect(text()).toContain("including hidden");
});
test("goal funding displays missing FX as unavailable without NaN or zero", async () => {
  const progress = calculateGoalProgress(mockWalletData)[0];
  await act(async () => {
    tree = create(
      <GoalFundingPlan
        progress={{
          ...progress,
          remaining: Number.NaN,
          hasMissingExchangeRate: true,
        }}
      />,
    );
  });
  expect(text()).toContain("Unavailable");
  expect(text()).toContain("Exchange rate needed");
  expect(text()).not.toContain("NaN");
  expect(text()).not.toContain("Per day");
});
test("paused goal preserves remaining but does not suggest daily contributions", async () => {
  const progress = calculateGoalProgress(mockWalletData)[0];
  await act(async () => {
    tree = create(
      <GoalFundingPlan
        progress={{
          ...progress,
          goal: { ...progress.goal, status: "paused" },
          remaining: 50,
          hasMissingExchangeRate: false,
        }}
      />,
    );
  });
  expect(text()).toContain(formatMoney(50, progress.goal.currency));
  expect(text()).toContain("No contributions planned");
  expect(text()).not.toContain("Per day");
});
