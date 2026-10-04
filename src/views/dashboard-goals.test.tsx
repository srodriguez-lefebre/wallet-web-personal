import { act, create } from "react-test-renderer";
import type { PropsWithChildren } from "react";
import { expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { DashboardView } from "./dashboard-view";

const state = vi.hoisted(() => ({ dataset: undefined as unknown }));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
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
  return Object.fromEntries(
    [
      "CartesianGrid",
      "Cell",
      "Legend",
      "Line",
      "LineChart",
      "Pie",
      "PieChart",
      "ResponsiveContainer",
      "Tooltip",
      "XAxis",
      "YAxis",
    ].map((name) => [name, Part]),
  );
});

test("dashboard excludes completed visible goals while keeping active goals", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const dataset = structuredClone(mockWalletData);
  const base = dataset.goals[0];
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
