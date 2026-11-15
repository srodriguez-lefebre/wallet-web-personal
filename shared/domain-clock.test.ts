import { expect, test } from "vitest";

import { calculateSummary } from "./analytics";
import { calculateAccountBalances, calculateAccountBalanceAtDate } from "./balances";
import { mockWalletData } from "./mock-data";
import { calculateAllowedDailySpend, calculateEndOfMonthProjection } from "./simulations";
import { recordFingerprint } from "./record-identity";

import type { WalletDataset, WalletRecord } from "./types";

const record: WalletRecord = {
  id: "synthetic-clock-expense",
  type: "expense",
  amount: 100,
  currency: "UYU",
  accountId: "synthetic-bank",
  accountAmount: 100,
  tagIds: [],
  paymentType: "debit",
  paymentStatus: "cleared",
  exchangeRateToPrimary: 1,
  occurredAt: "2026-06-02T12:00:00Z",
};
const dataset: WalletDataset = {
  ...mockWalletData,
  accounts: [
    {
      id: "synthetic-bank",
      name: "Synthetic bank",
      type: "bank",
      currency: "UYU",
      initialBalance: 1000,
      color: "blue",
      icon: "bank",
      isActive: true,
      isVisible: true,
    },
  ],
  records: [record],
  creditCards: [],
  creditCardRecords: [],
  creditCardPayments: [],
  goalReservations: [],
  goalReservationMovements: [],
  exchangeRates: [],
};
test("summary and simulations use the supplied clock consistently", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  expect(calculateSummary(dataset, "2026-06", now)).toMatchObject({
    expenses: 100,
    dailyAverageExpense: 10,
    availableDaily: 900 / 21,
  });
  expect(calculateAllowedDailySpend(dataset, now)).toBe(900 / 21);
  expect(calculateEndOfMonthProjection(dataset, 10, now)).toBe(690);
});
test("one account calculation handles cutoff records and historical reservation movements", () => {
  const history: WalletDataset = {
    ...dataset,
    records: [
      record,
      {
        ...record,
        id: "synthetic-later",
        amount: 200,
        accountAmount: 200,
        occurredAt: "2026-07-02T12:00:00Z",
      },
    ],
    goalReservations: [
      {
        id: "synthetic-reserve",
        goalId: "synthetic-goal",
        accountId: "synthetic-bank",
        amount: 20,
        currency: "UYU",
        createdAt: "2026-06-05T12:00:00Z",
      },
    ],
    goalReservationMovements: [
      {
        id: "reserve",
        goalId: "synthetic-goal",
        accountId: "synthetic-bank",
        amount: 40,
        currency: "UYU",
        createdAt: "2026-06-05T12:00:00Z",
        type: "reserve",
      },
      {
        id: "release",
        goalId: "synthetic-goal",
        accountId: "synthetic-bank",
        amount: 20,
        currency: "UYU",
        createdAt: "2026-07-05T12:00:00Z",
        type: "release",
      },
    ],
  };
  expect(calculateAccountBalances(history, new Date())[0]).toMatchObject({
    totalBalance: 700,
    reserved: 20,
    freeBalance: 680,
  });
  expect(
    calculateAccountBalances(
      history,
      new Date("2026-06-30T23:59:59.999Z"),
      new Date("2026-06-30T23:59:59.999Z"),
    )[0],
  ).toMatchObject({ totalBalance: 900, reserved: 40, freeBalance: 860 });
  expect(calculateAccountBalanceAtDate(history, "synthetic-bank", "2026-06-30")).toBe(860);
});
test("equal salaries on different dates have distinct identities while a retry is stable", () => {
  const salary = { ...record, type: "income" as const, amount: 5000, accountAmount: 5000 };
  expect(recordFingerprint(salary)).toBe(recordFingerprint({ ...salary }));
  expect(recordFingerprint(salary)).not.toBe(
    recordFingerprint({ ...salary, occurredAt: "2026-07-02T12:00:00Z" }),
  );
});
