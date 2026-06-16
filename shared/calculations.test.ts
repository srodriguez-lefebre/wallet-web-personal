import { describe, expect, it } from "vitest";
import {
  calculateAccountBalanceAtMonthEnd,
  calculateAccountBalances,
  calculateBudgetProgress,
  calculateCategoryExpenses,
  calculateGoalProgress,
  calculateSummary,
  formatMoney,
  groupRecordsByDay,
  relativeMonthKeys,
} from "./calculations.js";
import { mockWalletData } from "./mock-data.js";

describe("wallet calculations", () => {
  it("calculates monthly income, expenses and cash flow without counting transfers", () => {
    const summary = calculateSummary(mockWalletData, "2026-06");

    expect(summary.income).toBe(55557);
    expect(summary.expenses).toBe(35030);
    expect(summary.cashFlow).toBe(20527);
  });

  it("formats money with up to two decimal places", () => {
    expect(formatMoney(1234.567, "UYU")).toBe("$\u00a01.234,57");
    expect(formatMoney(1234, "UYU")).toBe("$\u00a01.234");
  });

  it("calculates account balances from initial balances and records", () => {
    const balances = calculateAccountBalances(mockWalletData);
    const bank = balances.find((item) => item.account.id === "acc-bank");
    const hidden = balances.find((item) => item.account.id === "acc-hidden");

    expect(bank?.balance).toBe(104913);
    expect(hidden?.balance).toBe(36000);
  });

  it("calculates account balance at the end of a selected month", () => {
    expect(
      calculateAccountBalanceAtMonthEnd(mockWalletData, "acc-bank", "2026-05"),
    ).toBe(92400);
    expect(
      calculateAccountBalanceAtMonthEnd(mockWalletData, "acc-bank", "2026-06"),
    ).toBe(104913);
    expect(
      calculateAccountBalanceAtMonthEnd(
        mockWalletData,
        "acc-hidden",
        "2026-06",
      ),
    ).toBe(36000);
  });

  it("builds a chronological window ending at the selected month", () => {
    expect(relativeMonthKeys("2026-06", 3)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("groups expenses by category", () => {
    const categories = calculateCategoryExpenses(mockWalletData, "2026-06");
    const housing = categories.find((item) => item.id === "cat-housing");

    expect(housing?.value).toBe(18500);
    expect(categories[0]?.id).toBe("cat-housing");
  });

  it("calculates goal progress with reserved money and tagged expenses", () => {
    const goals = calculateGoalProgress(mockWalletData);
    const trip = goals.find((item) => item.goal.id === "goal-trip");

    expect(trip?.reserved).toBe(15000);
    expect(trip?.spent).toBe(9200);
    expect(trip?.committed).toBe(24200);
  });

  it("calculates budget status", () => {
    const budgets = calculateBudgetProgress(mockWalletData, "2026-06");
    const general = budgets.find((item) => item.budget.id === "budget-general");

    expect(general?.spent).toBe(35030);
    expect(general?.status).toBe("ok");
  });

  it("groups records by day", () => {
    const groups = groupRecordsByDay(mockWalletData.records);

    expect(groups["2026-06-14"]).toHaveLength(2);
  });
});
