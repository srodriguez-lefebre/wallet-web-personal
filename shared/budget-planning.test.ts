import { describe, expect, it } from "vitest";
import { mockWalletData } from "./mock-data";
import type { Budget, WalletDataset, WalletRecord } from "./types";
import { buildBudgetPlan } from "./budget-planning";
import { reportDataset } from "../src/lib/preferences";

const food = "10000000-0000-4000-8000-000000000001";
const dining = "10000000-0000-4000-8000-000000000002";
function fixture(): WalletDataset {
  return {
    ...structuredClone(mockWalletData),
    settings: {
      ...mockWalletData.settings,
      primaryCurrency: "UYU",
      includeHiddenAccountsInReports: false,
    },
    categories: [
      { id: food, name: "Food", color: "#ff0000", icon: "utensils" },
      {
        id: dining,
        name: "Dining",
        parentId: food,
        color: "#ff0000",
        icon: "utensils",
      },
      { id: "unused", name: "Unused", color: "#ff0000", icon: "utensils" },
    ],
    budgets: [],
    records: [],
  };
}
function expense(overrides: Partial<WalletRecord> = {}): WalletRecord {
  return {
    ...mockWalletData.records[0],
    id: "expense",
    type: "expense",
    accountId: "acc-bank",
    amount: 30,
    currency: "UYU",
    exchangeRateToPrimary: 1,
    categoryId: food,
    paymentStatus: "cleared",
    occurredAt: "2026-01-10T12:00:00Z",
    ...overrides,
  };
}

describe("history budget planning", () => {
  it("rejects future target months so every source month is complete at the planning date", () => {
    const dataset = fixture();
    dataset.records = [expense({ occurredAt: "2026-07-03T12:00:00Z" })];
    const today = new Date(2026, 9, 3, 12);
    expect(() => buildBudgetPlan(dataset, "2026-11", 10, [], today)).toThrow(
      /complete|earlier/i,
    );
    expect(
      buildBudgetPlan(dataset, "2026-10", 10, [], today).sourceMonths,
    ).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(
      buildBudgetPlan(dataset, "2026-09", 10, [], today).sourceMonths,
    ).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("keeps direct unlinked card purchases outside the wallet-record budget domain", () => {
    const dataset = fixture();
    dataset.records = [expense({ amount: 30 })];
    const purchase = {
      id: "linked-card-entry",
      creditCardId: "card",
      walletRecordId: "expense",
      kind: "purchase" as const,
      amount: 30,
      currency: "UYU" as const,
      amountInLimitCurrency: 30,
      exchangeRateToLimitCurrency: 1,
      categoryId: food,
      accountImpactAtCreation: false,
      occurredAt: "2026-01-10T12:00:00Z",
    };
    dataset.creditCardRecords = [
      purchase,
      {
        ...purchase,
        id: "direct-card-entry",
        walletRecordId: undefined,
        amount: 3000,
        amountInLimitCurrency: 3000,
      },
    ];
    expect(buildBudgetPlan(dataset, "2026-02", 0).proposals[0]).toMatchObject({
      total: 30,
      limitAmount: 10,
    });
  });
  it("uses the three full calendar months before the target including zero-spend months", () => {
    const dataset = fixture();
    dataset.records = [
      expense({ amount: 100.01 }),
      expense({ amount: 999, occurredAt: "2026-02-01T12:00:00Z" }),
      expense({ amount: 999, occurredAt: "2025-10-31T12:00:00Z" }),
    ];
    const plan = buildBudgetPlan(dataset, "2026-02", 10);
    expect(plan.sourceMonths).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0]).toMatchObject({
      categoryId: food,
      total: 100.01,
      limitAmount: 36.68,
      status: "ready",
    });
    expect(plan.proposals[0].monthlyAmounts).toEqual([0, 0, 100.01]);
  });

  it("handles leap calendar boundaries and allows margins zero through one hundred", () => {
    const dataset = fixture();
    dataset.records = [
      expense({ amount: 30, occurredAt: "2024-02-29T12:00:00Z" }),
    ];
    expect(
      buildBudgetPlan(dataset, "2024-03", 0).proposals[0].limitAmount,
    ).toBe(10);
    expect(
      buildBudgetPlan(dataset, "2024-03", 100).proposals[0].limitAmount,
    ).toBe(20);
    for (const margin of [-1, 101, Number.NaN])
      expect(() => buildBudgetPlan(dataset, "2024-03", margin)).toThrow();
    for (const month of ["2024-00", "2024-13", "2024-2", "not-a-month"])
      expect(() => buildBudgetPlan(dataset, month, 10)).toThrow();
  });

  it("uses frozen FX and approved expenses once without summing linked card entries or descendants twice", () => {
    const dataset = fixture();
    dataset.records = [
      expense({
        amount: 2,
        currency: "USD",
        exchangeRateToPrimary: 40,
        categoryId: dining,
      }),
      expense({ amount: 10 }),
      expense({ amount: 500, paymentStatus: "needs_review" }),
      expense({ amount: 500, paymentStatus: "cancelled" }),
      expense({ amount: 500, type: "income" }),
      expense({ amount: 500, type: "transfer" }),
      expense({ amount: 3, paymentStatus: "pending" }),
    ];
    dataset.creditCardRecords = [
      {
        ...mockWalletData.creditCardRecords[0],
        walletRecordId: "expense",
        amount: 5000,
        amountInLimitCurrency: 5000,
      },
    ];
    const plan = buildBudgetPlan(dataset, "2026-02", 0);
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0]).toMatchObject({
      categoryId: food,
      total: 93,
      limitAmount: 31,
    });
  });

  it("respects report account visibility but includes inactive accounts' durable history", () => {
    const dataset = fixture();
    dataset.accounts = [
      {
        ...dataset.accounts[0],
        id: "visible",
        isVisible: true,
        isActive: false,
      },
      { ...dataset.accounts[0], id: "hidden", isVisible: false },
    ];
    dataset.records = [
      expense({ accountId: "visible", amount: 30 }),
      expense({ accountId: "hidden", amount: 300 }),
    ];
    expect(
      buildBudgetPlan(reportDataset(dataset), "2026-02", 0).proposals[0].total,
    ).toBe(30);
    dataset.settings.includeHiddenAccountsInReports = true;
    expect(
      buildBudgetPlan(reportDataset(dataset), "2026-02", 0).proposals[0].total,
    ).toBe(330);
  });

  it("withholds incomplete category totals when historical FX is invalid", () => {
    const dataset = fixture();
    dataset.records = [
      expense(),
      expense({ currency: "USD", exchangeRateToPrimary: 0 }),
    ];
    expect(buildBudgetPlan(dataset, "2026-02", 0).proposals[0]).toMatchObject({
      status: "missing_exchange_rate",
      total: null,
      limitAmount: null,
    });
    dataset.records = [
      expense({ currency: "USD", exchangeRateToPrimary: Number.NaN }),
    ];
    expect(buildBudgetPlan(dataset, "2026-02", 0).proposals[0].status).toBe(
      "missing_exchange_rate",
    );
  });

  it("skips uncategorized, deleted-category and zero-spend records", () => {
    const dataset = fixture();
    dataset.records = [
      expense({ categoryId: undefined }),
      expense({ categoryId: "deleted" }),
      expense({ amount: 0 }),
    ];
    expect(buildBudgetPlan(dataset, "2026-02", 10).proposals).toEqual([]);
  });

  it("does not offer categories whose parent hierarchy is missing or cyclic", () => {
    const dataset = fixture();
    dataset.categories[0].parentId = "deleted-parent";
    dataset.records = [expense()];
    expect(buildBudgetPlan(dataset, "2026-02", 10).proposals).toEqual([]);
    dataset.categories[0].parentId = dining;
    expect(buildBudgetPlan(dataset, "2026-02", 10).proposals).toEqual([]);
  });

  it("rounds any positive small estimate up to a cent without representation noise adding another cent", () => {
    const dataset = fixture();
    dataset.records = [expense({ amount: 1e-20 })];
    expect(
      buildBudgetPlan(dataset, "2026-02", 0).proposals[0].limitAmount,
    ).toBe(0.01);
    dataset.records = [expense({ amount: 30 })];
    expect(
      buildBudgetPlan(dataset, "2026-02", 10).proposals[0].limitAmount,
    ).toBe(11);
  });

  it("blocks overlapping active categories in any currency or scope but permits archived budgets", () => {
    const dataset = fixture();
    dataset.records = [expense()];
    const budget: Budget = {
      ...mockWalletData.budgets[0],
      id: "existing",
      categoryId: dining,
      currency: "USD",
      accountId: "hidden",
      isActive: true,
    };
    expect(
      buildBudgetPlan(dataset, "2026-02", 10, [budget]).proposals[0],
    ).toMatchObject({ status: "conflict", conflictingBudgetIds: ["existing"] });
    expect(
      buildBudgetPlan(dataset, "2026-02", 10, [{ ...budget, isActive: false }])
        .proposals[0].status,
    ).toBe("ready");
  });
});
