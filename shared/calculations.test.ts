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
  calculateCreditCardSummary,
  calculateCreditCardCategoryUsage,
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

  it("tracks one card limit across currencies without changing an account on purchase", () => {
    const card = {
      id: "card-4006",
      name: "International",
      issuer: "Itau",
      lastFour: "4006",
      creditLimit: 10000,
      limitCurrency: "UYU" as const,
      closingDay: 20,
      dueDay: 5,
      color: "#2563EB",
      icon: "credit-card",
      isActive: true,
    };
    const dataset = {
      ...mockWalletData,
      creditCards: [card],
      records: [
        ...mockWalletData.records,
        {
          id: "card-expense-usd",
          type: "expense" as const,
          amount: 100,
          currency: "USD" as const,
          creditCardId: card.id,
          categoryId: "cat-shopping",
          tagIds: [],
          paymentType: "credit" as const,
          paymentStatus: "cleared" as const,
          exchangeRateToPrimary: 40,
          amountInLimitCurrency: 4000,
          exchangeRateToLimitCurrency: 40,
          occurredAt: "2026-06-10T12:00:00.000Z",
        },
        {
          id: "card-expense-uyu",
          type: "expense" as const,
          amount: 1000,
          currency: "UYU" as const,
          creditCardId: card.id,
          categoryId: "cat-shopping",
          tagIds: [],
          paymentType: "credit" as const,
          paymentStatus: "pending" as const,
          exchangeRateToPrimary: 1,
          amountInLimitCurrency: 1000,
          exchangeRateToLimitCurrency: 1,
          occurredAt: "2026-06-22T12:00:00.000Z",
        },
      ],
      creditCardPayments: [],
    };
    const bankBefore = calculateAccountBalances(dataset).find(
      (item) => item.account.id === "acc-bank",
    )?.balance;
    const summary = calculateCreditCardSummary(
      dataset,
      card,
      new Date("2026-06-25T12:00:00.000Z"),
    );

    expect(summary.usedLimit).toBe(5000);
    expect(summary.availableLimit).toBe(5000);
    expect(summary.statementDue).toEqual([{ currency: "USD", amount: 100 }]);
    expect(summary.currentCycle).toEqual([{ currency: "UYU", amount: 1000 }]);
    expect(summary.currentCycleStart).toBe("2026-06-21");
    expect(summary.currentCycleEnd).toBe("2026-07-20");
    expect(summary.dueDate).toBe("2026-07-05");
    expect(
      calculateAccountBalances(dataset).find(
        (item) => item.account.id === "acc-bank",
      )?.balance,
    ).toBe(bankBefore);
  });

  it("applies a partial card payment to debt, limit and the selected account", () => {
    const card = {
      id: "card-4006",
      name: "International",
      issuer: "Itau",
      lastFour: "4006",
      creditLimit: 10000,
      limitCurrency: "UYU" as const,
      closingDay: 20,
      dueDay: 5,
      color: "#2563EB",
      icon: "credit-card",
      isActive: true,
    };
    const base = {
      ...mockWalletData,
      creditCards: [card],
      records: [
        ...mockWalletData.records,
        {
          id: "card-expense",
          type: "expense" as const,
          amount: 100,
          currency: "USD" as const,
          creditCardId: card.id,
          categoryId: "cat-shopping",
          tagIds: [],
          paymentType: "credit" as const,
          paymentStatus: "cleared" as const,
          exchangeRateToPrimary: 40,
          amountInLimitCurrency: 4000,
          exchangeRateToLimitCurrency: 40,
          occurredAt: "2026-06-10T12:00:00.000Z",
        },
      ],
      creditCardPayments: [],
    };
    const before =
      calculateAccountBalances(base).find(
        (item) => item.account.id === "acc-bank",
      )?.balance ?? 0;
    const dataset = {
      ...base,
      creditCardPayments: [
        {
          id: "payment-1",
          creditCardId: card.id,
          amount: 25,
          currency: "USD" as const,
          amountInLimitCurrency: 1000,
          accountId: "acc-bank",
          accountAmount: 1000,
          occurredAt: "2026-06-25T12:00:00.000Z",
        },
      ],
    };
    const summary = calculateCreditCardSummary(
      dataset,
      card,
      new Date("2026-06-25T13:00:00.000Z"),
    );

    expect(summary.usedLimit).toBe(3000);
    expect(summary.outstanding).toEqual([{ currency: "USD", amount: 75 }]);
    expect(summary.statementDue).toEqual([{ currency: "USD", amount: 75 }]);
    expect(
      calculateAccountBalances(dataset).find(
        (item) => item.account.id === "acc-bank",
      )?.balance,
    ).toBe(before - 1000);
  });

  it("splits the remaining card usage by root category after payments", () => {
    const card = {
      id: "card-chart",
      name: "Chart card",
      issuer: "Test",
      lastFour: "4006",
      creditLimit: 10000,
      limitCurrency: "UYU" as const,
      closingDay: 20,
      dueDay: 5,
      color: "#2563EB",
      icon: "credit-card",
      isActive: true,
    };
    const dataset = {
      ...mockWalletData,
      creditCards: [card],
      records: [
        {
          id: "food-purchase",
          type: "expense" as const,
          amount: 3000,
          currency: "UYU" as const,
          creditCardId: card.id,
          categoryId: "cat-groceries",
          tagIds: [],
          paymentType: "credit" as const,
          paymentStatus: "cleared" as const,
          exchangeRateToPrimary: 1,
          amountInLimitCurrency: 3000,
          exchangeRateToLimitCurrency: 1,
          occurredAt: "2026-06-10T12:00:00.000Z",
        },
        {
          id: "shopping-purchase",
          type: "expense" as const,
          amount: 1000,
          currency: "UYU" as const,
          creditCardId: card.id,
          categoryId: "cat-shopping",
          tagIds: [],
          paymentType: "credit" as const,
          paymentStatus: "cleared" as const,
          exchangeRateToPrimary: 1,
          amountInLimitCurrency: 1000,
          exchangeRateToLimitCurrency: 1,
          occurredAt: "2026-06-11T12:00:00.000Z",
        },
      ],
      creditCardPayments: [
        {
          id: "chart-payment",
          creditCardId: card.id,
          amount: 1000,
          currency: "UYU" as const,
          amountInLimitCurrency: 1000,
          occurredAt: "2026-06-12T12:00:00.000Z",
        },
      ],
    };

    const usage = calculateCreditCardCategoryUsage(
      dataset,
      card,
      new Date("2026-06-13T12:00:00.000Z"),
    );

    expect(usage).toEqual([
      expect.objectContaining({ id: "cat-groceries", amount: 2250 }),
      expect.objectContaining({ id: "cat-shopping", amount: 750 }),
    ]);
    expect(usage.reduce((total, item) => total + item.amount, 0)).toBe(3000);
  });

  it("keeps card-only movements outside Records and applies their optional account impact once", () => {
    const card = {
      id: "card-owned-ledger", name: "Test", issuer: "Bank", lastFour: "4006",
      creditLimit: 10_000, limitCurrency: "UYU" as const, closingDay: 20,
      dueDay: 5, color: "#000000", icon: "credit-card", isActive: true,
    };
    const baseline = calculateAccountBalances(mockWalletData).find((item) => item.account.id === "acc-bank")!.balance;
    const dataset = {
      ...mockWalletData,
      creditCards: [card],
      creditCardRecords: [
        {
          id: "direct", creditCardId: card.id, kind: "purchase" as const,
          amount: 2_000, currency: "UYU" as const, amountInLimitCurrency: 2_000,
          exchangeRateToLimitCurrency: 1, categoryId: "cat-shopping",
          accountId: "acc-bank", accountAmount: 2_000, accountImpactAtCreation: true,
          occurredAt: "2026-06-10T12:00:00.000Z",
        },
        {
          id: "refund", creditCardId: card.id, originalRecordId: "direct", kind: "refund" as const,
          amount: 500, currency: "UYU" as const, amountInLimitCurrency: 500,
          exchangeRateToLimitCurrency: 1, categoryId: "cat-shopping",
          accountId: "acc-bank", accountAmount: 500, accountImpactAtCreation: true,
          occurredAt: "2026-06-11T12:00:00.000Z",
        },
      ],
    };

    expect(dataset.records.some((record) => record.id === "direct")).toBe(false);
    expect(calculateCreditCardSummary(dataset, card, new Date("2026-06-12T12:00:00.000Z")).usedLimit).toBe(1_500);
    expect(calculateAccountBalances(dataset).find((item) => item.account.id === "acc-bank")!.balance).toBe(baseline - 1_500);
  });
});
