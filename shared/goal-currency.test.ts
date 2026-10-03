import { expect, test } from "vitest";
import { calculateGoalProgress } from "./calculations.js";
import { mockWalletData } from "./mock-data.js";

function dataset() {
  const data = structuredClone(mockWalletData);
  data.goals = [
    { ...data.goals[0], id: "goal-trip", currency: "USD", targetAmount: 1000 },
  ];
  data.goalReservations = [];
  data.records = [
    {
      ...data.records.find((record) => record.id === "rec-trip-flight")!,
      currency: "UYU",
      amount: 4000,
      accountId: undefined,
      accountAmount: undefined,
      goalIds: ["goal-trip"],
      occurredAt: "2026-06-15T12:00:00.000Z",
    },
  ];
  data.exchangeRates = [];
  return data;
}

test("goal record conversion uses rates known when the record occurred", () => {
  const data = dataset();
  data.exchangeRates = [
    {
      id: "new",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 50,
      date: "2026-07-01T00:00:00.000Z",
    },
    {
      id: "old",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 40,
      date: "2026-06-01T00:00:00.000Z",
    },
  ];
  expect(calculateGoalProgress(data)[0].spent).toBe(100);
});

test("stored amount in the goal account currency preserves the historical conversion", () => {
  const data = dataset();
  data.accounts = [{ ...data.accounts[0], id: "usd-account", currency: "USD" }];
  data.records[0].accountId = "usd-account";
  data.records[0].accountAmount = 80;
  data.records[0].goalAssociations = [
    {
      goalId: "goal-trip",
      assignmentSource: "manual",
      allocatedAmount: 2000,
      useReserved: true,
      reserveIncome: true,
    },
  ];
  expect(calculateGoalProgress(data)[0].spent).toBe(40);
});

test("missing goal conversion is marked unavailable instead of a 1:1 total", () => {
  const result = calculateGoalProgress(dataset())[0];
  expect(result.hasMissingExchangeRate).toBe(true);
  expect(Number.isNaN(result.committed)).toBe(true);
});

test("goal reservations support inverse quotes without fabricating a primary rate", () => {
  const data = dataset();
  data.records = [];
  data.goalReservations = [
    {
      id: "reserve",
      goalId: "goal-trip",
      accountId: "acc-bank",
      amount: 4000,
      currency: "UYU",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  data.exchangeRates = [
    {
      id: "rate",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 40,
      date: "2026-06-01T00:00:00.000Z",
    },
  ];
  expect(calculateGoalProgress(data)[0].reserved).toBe(100);
});
