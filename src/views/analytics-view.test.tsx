import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { AnalyticsView } from "./analytics-view";

const dataset = structuredClone(mockWalletData);
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset,
    selectedMonth: "2026-01",
    selectedPeriodMode: "month",
    selectedDateRange: { from: "2026-01-01", to: "2026-01-31" },
    recordFilters: {},
    setRecordFilters: vi.fn(),
    isAllHistoryComplete: true,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
// Charts require browser sizing; the rendered budget card uses real calculations.
vi.mock("recharts", () =>
  Object.fromEntries(
    [
      "Bar",
      "BarChart",
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
    ].map((name) => [name, () => null]),
  ),
);
let tree: ReactTestRenderer | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  vi.unstubAllGlobals();
});

test("a budget with missing FX displays a missing-rate placeholder for spent and progress", async () => {
  dataset.exchangeRates = [];
  dataset.settings.primaryCurrency = "UYU";
  dataset.budgets = [
    {
      id: "foreign-budget",
      name: "USD budget",
      currency: "USD",
      limitAmount: 100,
      period: "monthly",
      color: "blue",
      isActive: true,
    },
  ];
  dataset.records = [
    {
      ...mockWalletData.records[0],
      type: "expense",
      currency: "UYU",
      amount: 50,
      paymentStatus: "cleared",
      occurredAt: "2026-01-01T12:00:00Z",
      exchangeRateToPrimary: 1,
      tagIds: [],
      goalIds: [],
      goalAssociations: [],
    },
  ];
  await act(async () => {
    tree = create(<AnalyticsView />);
  });
  const budget = tree!.root
    .findAllByType("button")
    .find((button) =>
      button.findAllByType("p").some((p) => p.children.includes("USD budget")),
    )!;
  const spent = budget.findAllByType("p")[1];
  expect(spent.children.join("")).toContain("Falta cotización");
  expect(spent.children.join("")).not.toContain("NaN");
  expect(budget.findAllByType("p")[2].children).toEqual(["Falta cotización"]);
});
