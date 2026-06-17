import { describe, expect, it } from "vitest";
import {
  applyDebtPayment,
  buildDueRecurringDebtInstances,
  calculateAccountBalanceAtDate,
  calculateAccountBalanceAtMonthEnd,
  calculateAccountBalances,
  calculateBudgetProgress,
  calculateCategoryExpenses,
  calculateCategoryExpensesForDateRange,
  calculateGoalProgress,
  calculateVisibleDebtSummary,
  calculateSummary,
  calculateSummaryForDateRange,
  dateKeysForRange,
  formatMoney,
  groupRecordsByDay,
  recordsForDateRange,
  relativeDateRanges,
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

  it("calculates account balance at the end of a selected day", () => {
    expect(
      calculateAccountBalanceAtDate(mockWalletData, "acc-bank", "2026-06-06"),
    ).toBe(116913);
    expect(
      calculateAccountBalanceAtDate(mockWalletData, "acc-bank", "2026-06-07"),
    ).toBe(104913);
  });

  it("builds a chronological window ending at the selected month", () => {
    expect(relativeMonthKeys("2026-06", 3)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("builds chronological windows for custom date ranges", () => {
    expect(
      relativeDateRanges({ from: "2026-06-08", to: "2026-06-14" }, 3),
    ).toEqual([
      { from: "2026-05-25", to: "2026-05-31" },
      { from: "2026-06-01", to: "2026-06-07" },
      { from: "2026-06-08", to: "2026-06-14" },
    ]);
  });

  it("builds date keys for a custom range", () => {
    expect(dateKeysForRange({ from: "2026-06-05", to: "2026-06-07" })).toEqual([
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
    ]);
  });

  it("filters and summarizes records by custom date range", () => {
    const range = { from: "2026-06-01", to: "2026-06-07" };
    const records = recordsForDateRange(mockWalletData.records, range);
    const summary = calculateSummaryForDateRange(mockWalletData, range);
    const categories = calculateCategoryExpensesForDateRange(
      mockWalletData,
      range,
    );

    expect(records.map((record) => record.id)).toEqual([
      "rec-income-1",
      "rec-rent",
      "rec-food-1",
      "rec-transfer-usd",
    ]);
    expect(summary.income).toBe(43013);
    expect(summary.expenses).toBe(22340);
    expect(summary.cashFlow).toBe(20673);
    expect(categories.find((item) => item.id === "cat-housing")?.value).toBe(
      18500,
    );
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

  it("summarizes visible open debts with receivables as positive and payables as negative", () => {
    const summary = calculateVisibleDebtSummary({
      ...mockWalletData,
      debts: [
        {
          id: "debt-receivable",
          name: "Loan to friend",
          direction: "receivable",
          originalAmount: 10000,
          pendingAmount: 6000,
          currency: "UYU",
          counterpartyName: "Friend",
          categoryId: "cat-income",
          status: "active",
          isVisible: true,
          startedAt: "2026-06-01T12:00:00.000Z",
        },
        {
          id: "debt-payable",
          name: "Mobile bill",
          direction: "payable",
          originalAmount: 1200,
          pendingAmount: 1200,
          currency: "UYU",
          counterpartyName: "Carrier",
          categoryId: "cat-shopping",
          status: "active",
          isVisible: true,
          startedAt: "2026-06-03T12:00:00.000Z",
        },
        {
          id: "debt-closed",
          name: "Closed",
          direction: "payable",
          originalAmount: 500,
          pendingAmount: 0,
          currency: "UYU",
          counterpartyName: "Store",
          categoryId: "cat-shopping",
          status: "paid",
          isVisible: true,
          startedAt: "2026-06-01T12:00:00.000Z",
        },
      ],
    });

    expect(summary.toCollect).toBe(6000);
    expect(summary.toPay).toBe(1200);
    expect(summary.net).toBe(4800);
    expect(summary.openCount).toBe(2);
  });

  it("keeps amount-pending debts visible without adding them to totals", () => {
    const summary = calculateVisibleDebtSummary({
      ...mockWalletData,
      debts: [
        {
          id: "debt-pending",
          name: "Bill without amount",
          direction: "payable",
          currency: "UYU",
          counterpartyName: "Carrier",
          categoryId: "cat-shopping",
          status: "active",
          isVisible: true,
          startedAt: "2026-06-03T12:00:00.000Z",
        },
      ],
    });

    expect(summary.amountPendingCount).toBe(1);
    expect(summary.toPay).toBe(0);
    expect(summary.openCount).toBe(1);
  });

  it("creates all due monthly recurring debt instances without duplicates", () => {
    const instances = buildDueRecurringDebtInstances(
      {
        ...mockWalletData,
        debts: [
          {
            id: "existing-generated",
            name: "Mobile contract - 2026-06",
            direction: "payable",
            originalAmount: 1200,
            pendingAmount: 1200,
            currency: "UYU",
            counterpartyName: "Carrier",
            categoryId: "cat-shopping",
            status: "active",
            isVisible: true,
            startedAt: "2026-06-03T12:00:00.000Z",
            dueAt: "2026-06-03T12:00:00.000Z",
            recurringDebtId: "recurring-mobile",
            recurringMonth: "2026-06",
          },
        ],
        recurringDebts: [
          {
            id: "recurring-mobile",
            name: "Mobile contract",
            direction: "payable",
            amount: 1200,
            currency: "UYU",
            counterpartyName: "Carrier",
            categoryId: "cat-shopping",
            dayOfMonth: 3,
            isActive: true,
            startedAt: "2026-06-01T12:00:00.000Z",
          },
        ],
      },
      new Date("2026-08-10T12:00:00.000Z"),
    );

    expect(instances.map((debt) => debt.recurringMonth)).toEqual([
      "2026-07",
      "2026-08",
    ]);
    expect(instances[0]).toMatchObject({
      name: "Mobile contract - 2026-07",
      dueAt: "2026-07-03T12:00:00.000Z",
      pendingAmount: 1200,
    });
  });

  it("closes a debt when a partial payment clears the remaining amount", () => {
    const result = applyDebtPayment(
      {
        id: "debt-payable",
        name: "Mobile bill",
        direction: "payable",
        originalAmount: 1200,
        pendingAmount: 500,
        currency: "UYU",
        counterpartyName: "Carrier",
        categoryId: "cat-shopping",
        status: "active",
        isVisible: true,
        startedAt: "2026-06-03T12:00:00.000Z",
      },
      500,
    );

    expect(result.pendingAmount).toBe(0);
    expect(result.status).toBe("paid");
  });

  it("groups records by day", () => {
    const groups = groupRecordsByDay(mockWalletData.records);

    expect(groups["2026-06-14"]).toHaveLength(2);
  });
});
