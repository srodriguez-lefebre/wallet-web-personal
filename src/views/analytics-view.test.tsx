import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { WalletDataset } from "../../shared/types";
import { formatMoney } from "../../shared/calculations";
import { AnalyticsView } from "./analytics-view";

let dataset:WalletDataset,historyComplete:boolean,assistantReads:number;
vi.mock("@/providers/wallet-provider",()=>({useWallet:()=>({dataset,selectedMonth:"2026-02",selectedPeriodMode:"month",selectedDateRange:{from:"2026-02-01",to:"2026-02-28"},recordFilters:{},setRecordFilters:vi.fn(),isAllHistoryComplete:historyComplete,getCompleteDataset:async()=>{assistantReads+=1;return structuredClone(dataset);},addBudget:vi.fn()})}));
vi.mock("react-router-dom",()=>({useNavigate:()=>vi.fn()}));
vi.mock("recharts",()=>{
  const Part=({children}:{children?:ReactNode})=><>{children}</>;
  return Object.fromEntries(["Bar","BarChart","CartesianGrid","Cell","Legend","Line","LineChart","Pie","PieChart","ResponsiveContainer","Tooltip","XAxis","YAxis"].map(name=>[name,Part]));
});
vi.mock("@/components/ui/dialog",()=>{
  const Part=({children}:{children?:ReactNode})=><div>{children}</div>;
  return {Dialog:Part,DialogContent:Part,DialogHeader:Part,DialogTitle:Part,DialogDescription:Part,DialogTrigger:Part};
});
let tree:ReactTestRenderer|undefined;
beforeEach(()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  historyComplete=true;assistantReads=0;dataset=structuredClone(mockWalletData);
  dataset.settings.primaryCurrency="UYU";dataset.settings.includeHiddenAccountsInReports=true;
  dataset.records=[{...dataset.records[0],id:"purchase",amount:10,currency:"USD",exchangeRateToPrimary:40,type:"expense",paymentStatus:"cleared",counterpartyName:"Visible shop",occurredAt:"2026-02-01T12:00:00Z"}];
});
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;vi.unstubAllGlobals();});

test("merchant table displays frozen spending once and explains the gross purchase scope",async()=>{
  await act(async()=>{tree=create(<AnalyticsView/>);});
  const table=tree!.root.findByType("table");
  expect(table.findAllByType("tr")).toHaveLength(2);
  expect(table.findByType("caption").children.join("")).toContain("Gross spending; refunds are not deducted");
  expect(table.findAllByType("td").map(cell=>cell.children.join(""))).toEqual(["1",formatMoney(400,"UYU"),formatMoney(400,"UYU")]);
});
test("merchant table withholds partial totals and shows a clear empty state for a complete period",async()=>{
  historyComplete=false;
  await act(async()=>{tree=create(<AnalyticsView/>);});
  expect(tree!.root.findAllByType("table")).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain("Loading complete history to compare merchants");
  historyComplete=true;dataset.records=[];
  await act(async()=>tree!.update(<AnalyticsView/>));
  expect(JSON.stringify(tree!.toJSON())).toContain("No recorded purchases in this period");
});
test("merchant table limits rows to the ten largest merchants",async()=>{
  dataset.records=Array.from({length:12},(_,index)=>({...dataset.records[0],id:String(index),counterpartyName:`Shop ${index}`,amount:index+1}));
  await act(async()=>{tree=create(<AnalyticsView/>);});
  const rows=tree!.root.findByType("tbody").findAllByType("tr");
  expect(rows).toHaveLength(10);
  expect(rows[0].findByType("th").children).toEqual(["Shop 11"]);
  expect(rows[9].findByType("th").children).toEqual(["Shop 2"]);
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
      occurredAt: "2026-02-01T12:00:00Z",
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

test("opens budget creation from analytics using the selected month and fresh full history",async()=>{
  await act(async()=>{tree=create(<AnalyticsView/>);});
  expect(assistantReads).toBe(0);
  const trigger=tree!.root.findAllByType("button").find(node=>node.children.includes("Budget assistant"));
  expect(trigger).toBeDefined();
  await act(async()=>{trigger!.props.onClick();});
  expect(assistantReads).toBe(1);
  expect(tree!.root.findByProps({"aria-label":"Target month"}).props.value).toBe("2026-02");
});
