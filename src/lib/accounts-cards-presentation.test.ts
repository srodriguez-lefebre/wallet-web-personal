import { expect, test } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { AccountBalance, WalletDataset } from "../../shared/types";
import { groupAccountLiquidity } from "./account-presentation";
import {
  cardLimitWarning,
  selectCardStatement,
  selectPendingCardStatements,
} from "./cards-presentation";

test("liquidity groups original currencies and excludes hidden, inactive and non-liquid accounts", () => {
  const account = mockWalletData.accounts[0];
  const rows = [
    { ...account, currency: "UYU", type: "bank" },
    { ...account, currency: "USD", type: "cash" },
    { ...account, isVisible: false },
    { ...account, isActive: false },
    { ...account, type: "investment" },
    { ...account, type: "credit_card" },
  ].map(
    (item, index) =>
      ({
        account: { ...item, id: String(index) },
        totalBalance: 100,
        reserved: 30,
        freeBalance: 70,
      }) as AccountBalance,
  );
  expect(groupAccountLiquidity(rows)).toEqual([
    { currency: "USD", total: 100, reserved: 30, free: 70, accountCount: 1 },
    { currency: "UYU", total: 100, reserved: 30, free: 70, accountCount: 1 },
  ]);
});

function fixture() {
  const dataset: WalletDataset = structuredClone(mockWalletData);
  dataset.creditCards = [
    {
      id: "card",
      name: "Archived",
      issuer: "Bank",
      lastFour: "1234",
      creditLimit: 1000,
      limitCurrency: "USD",
      closingDay: 20,
      dueDay: 5,
      color: "blue",
      icon: "card",
      isActive: false,
    },
  ];
  dataset.creditCardPayments = [];
  dataset.creditCardPaymentAllocations = [];
  dataset.creditCardStatements = [
    "2026-10-11",
    "2026-10-03",
    "2026-10-02",
    "2026-10-10",
  ].map((due, index) => ({
    id: String(index),
    creditCardId: "card",
    cycleStart: "2026-08-01",
    cycleEnd: "2026-08-31",
    closedAt: "2026-09-01",
    dueAt: `${due}T23:59:59.999Z`,
    status: "paid",
  }));
  dataset.creditCardRecords = dataset.creditCardStatements.map((statement) => ({
    id: `purchase-${statement.id}`,
    creditCardId: "card",
    statementId: statement.id,
    kind: "purchase",
    amount: 100,
    currency: "USD",
    amountInLimitCurrency: 100,
    exchangeRateToLimitCurrency: 1,
    categoryId: "category",
    accountImpactAtCreation: false,
    occurredAt: "2026-08-10T12:00:00Z",
  }));
  return dataset;
}
const asOf = new Date("2026-10-03T12:00:00Z");
test("agenda uses actual debt on archived cards, sorts deadlines, and classifies calendar days", () => {
  const entries = selectPendingCardStatements(fixture(), asOf);
  expect(
    entries.map((entry) => [
      entry.statement.id,
      entry.urgency,
      entry.daysUntilDue,
    ]),
  ).toEqual([
    ["2", "overdue", -1],
    ["1", "today", 0],
    ["3", "soon", 7],
    ["0", "later", 8],
  ]);
  expect(entries[0]).toMatchObject({
    dueAmountInLimitCurrency: 100,
    card: { isActive: false },
  });
});
test("refunds remove zero debt and future payments do not hide a current obligation", () => {
  const data = fixture();
  data.creditCardRecords.push({
    ...data.creditCardRecords[2],
    id: "refund",
    kind: "refund",
    originalRecordId: "purchase-2",
  });
  data.creditCardPayments = [
    {
      id: "future",
      creditCardId: "card",
      statementId: "1",
      amount: 100,
      currency: "USD",
      amountInLimitCurrency: 100,
      occurredAt: "2026-10-04T12:00:00Z",
    },
  ];
  expect(
    selectPendingCardStatements(data, asOf).map((entry) => entry.statement.id),
  ).toEqual(["1", "3", "0"]);
  data.creditCardPayments[0].occurredAt = "2026-10-02T12:00:00Z";
  data.creditCardPayments[0].amountInLimitCurrency = 40;
  expect(
    selectPendingCardStatements(data, asOf)[0].dueAmountInLimitCurrency,
  ).toBe(60);
});
test("detail honors a requested statement and otherwise opens the oldest actual unpaid statement", () => {
  const data = fixture();
  expect(selectCardStatement(data, "card", undefined, asOf)?.id).toBe("2");
  expect(selectCardStatement(data, "card", "0", asOf)?.id).toBe("0");
  expect(selectCardStatement(data, "card", "unknown", asOf)?.id).toBe("2");
});
test("limit warnings start at eighty percent and become critical at one hundred", () => {
  expect(cardLimitWarning(79.99)).toBeNull();
  expect(cardLimitWarning(80)?.severity).toBe("warning");
  expect(cardLimitWarning(100)?.severity).toBe("danger");
  expect(cardLimitWarning(120)?.severity).toBe("danger");
});

test("agenda keeps native currency breakdown after a payment in the limit currency", () => {
  const data = fixture();
  data.creditCardStatements = [data.creditCardStatements[2]];
  data.creditCardRecords = [
    {
      ...data.creditCardRecords[2],
      amountInLimitCurrency: 4000,
      exchangeRateToLimitCurrency: 40,
    },
  ];
  data.creditCards[0].limitCurrency = "UYU";
  data.creditCardPayments = [
    {
      id: "payment",
      creditCardId: "card",
      statementId: "2",
      amount: 2000,
      currency: "UYU",
      amountInLimitCurrency: 2000,
      occurredAt: "2026-10-02T12:00:00Z",
    },
  ];
  data.creditCardPaymentAllocations = [
    {
      id: "allocation",
      paymentId: "payment",
      creditCardRecordId: "purchase-2",
      amount: 50,
      amountInLimitCurrency: 2000,
    },
  ];
  expect(selectPendingCardStatements(data, asOf)[0]).toMatchObject({
    dueAmountInLimitCurrency: 2000,
    currencyBreakdown: [{ currency: "USD", amount: 50 }],
  });
  data.creditCardStatements[0].closedAt = "2026-10-04T12:00:00Z";
  expect(selectPendingCardStatements(data, asOf)).toEqual([]);
});
