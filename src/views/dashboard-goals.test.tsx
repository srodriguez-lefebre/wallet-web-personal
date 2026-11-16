import { act, create } from "react-test-renderer";
import { PieChart, Tooltip } from "recharts";
import { expect, test, vi } from "vitest";
import { mockWalletData } from "@shared/mock-data";
import { formatMoney } from "@shared/money";

import { DashboardView } from "./dashboard-view";

import type { PropsWithChildren } from "react";

import { withWalletMetadata } from "@/test/legacy-wallet-view";

const state = vi.hoisted(() => ({ dataset: ((): unknown => undefined)() }));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () =>
    withWalletMetadata({
      dataset: state.dataset,
      selectedMonth: "2026-02",
      selectedPeriodMode: "month",
      selectedDateRange: { from: "2026-02-01", to: "2026-02-28" },
      setRecordFilters: vi.fn(),
      recordDebtPayment: vi.fn(),
      isAllHistoryComplete: true,
    }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({ toast: null, runAction: vi.fn() }),
}));
vi.mock("recharts", () => {
  const Part = ({ children }: PropsWithChildren) => <div>{children}</div>;
  const parts = Object.fromEntries(
    [
      "CartesianGrid",
      "Cell",
      "Legend",
      "Line",
      "LineChart",
      "Pie",
      "ResponsiveContainer",
      "XAxis",
      "YAxis",
    ].map((name) => [name, Part]),
  );
  return {
    ...parts,
    PieChart: ({ children }: PropsWithChildren) => <div>{children}</div>,
    Tooltip: () => null,
  };
});

test("dashboard excludes completed visible goals while keeping active goals", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const dataset = structuredClone(mockWalletData);
  const base = dataset.goals[0]!;
  dataset.goals = [
    {
      ...base,
      id: "closed-goal",
      name: "Closed trip",
      status: "completed",
      isVisible: true,
    },
    {
      ...base,
      id: "active-goal",
      name: "Upcoming trip",
      status: "active",
      isVisible: true,
    },
  ];
  state.dataset = dataset;
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => {
      tree = create(<DashboardView />);
    });
    const content = JSON.stringify(tree.toJSON());
    expect(content).not.toContain("Closed trip");
    expect(content).toContain("Upcoming trip");
  } finally {
    if (tree) await act(async () => tree.unmount());
    vi.unstubAllGlobals();
  }
});

test("the expense pie formats converted totals in the primary currency", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.dataset = structuredClone(mockWalletData);
  let tree: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      tree = create(<DashboardView />);
    });
    const tooltip = tree!.root.findByType(PieChart).findByType(Tooltip);
    const format = tooltip.props.formatter as ((value: number) => string) | undefined;
    expect(format?.(1234.56789)).toBe(
      formatMoney(1234.57, mockWalletData.settings.primaryCurrency),
    );
  } finally {
    if (tree) await act(async () => tree?.unmount());
    vi.unstubAllGlobals();
  }
});

vi.mock("@/hooks/wallet-entities", async () => {
  const { legacyEntityHooks } = await import("@/test/legacy-wallet-view");
  const { useWallet } = await import("@/providers/wallet-provider");
  return legacyEntityHooks(useWallet);
});
