import { expect, test } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { RecordTemplate } from "../../shared/types";
import {
  prepareTemplateDraft,
  templateFromRecord,
  templateReplacementPatch,
} from "./record-templates";
const testCard = {
  id: "card",
  name: "Test card",
  issuer: "Bank",
  lastFour: "1234",
  creditLimit: 1000,
  limitCurrency: "UYU" as const,
  closingDay: 10,
  dueDay: 20,
  isActive: true,
  color: "#000",
  icon: "credit-card",
};
test("saving a template omits historical dates, rates, debts and reservation instructions", () => {
  const original = {
    ...mockWalletData.records[0],
    debtId: "historical-debt",
    exchangeRateToPrimary: 41,
    goalIds: ["historical-goal"],
    accountAmount: 4100,
  };
  const template = templateFromRecord(original, "  Coffee  ");
  expect(template.name).toBe("Coffee");
  expect(template).not.toHaveProperty("id");
  for (const key of [
    "debtId",
    "occurredAt",
    "exchangeRateToPrimary",
    "accountAmount",
    "destinationAmount",
    "goalIds",
    "goalAssociations",
    "paymentStatus",
    "statementId",
  ])
    expect(template).not.toHaveProperty(key);
  expect(template.amount).toBe(original.amount);
});
test("a saved template prepares a draft with today's card rate without writing or retaining missing references", () => {
  const data = structuredClone(mockWalletData);
  data.creditCards = [{ ...testCard }];
  const card = data.creditCards[0];
  data.exchangeRates = [
    {
      id: "old",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 40,
      date: "2020-01-01T12:00:00Z",
    },
    {
      id: "new",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 44,
      date: "2026-10-01T12:00:00Z",
    },
  ];
  card.limitCurrency = "UYU";
  const template: RecordTemplate = {
    id: "template",
    name: "Subscription",
    type: "expense",
    amount: 10,
    currency: "USD",
    paymentType: "credit",
    creditCardId: card.id,
    accountId: data.accounts[0].id,
    categoryId: "missing",
    tagId: "missing",
  };
  const result = prepareTemplateDraft(
    template,
    data,
    new Date("2026-10-03T12:00:00Z"),
  );
  expect(result.limitRate).toBe("44");
  expect(result.value.accountId).toBe(data.accounts[0].id);
  expect(result.value.categoryId).toBeUndefined();
  expect(result.value.tagId).toBeUndefined();
  expect(result.problems.length).toBeGreaterThan(0);
  expect(template.accountId).toBe(data.accounts[0].id);
});
test("archived cards and bank destinations are cleared without choosing another financial destination", () => {
  const data = structuredClone(mockWalletData);
  data.creditCards = [{ ...testCard, isActive: false }];
  data.accounts[0].isActive = false;
  const template: RecordTemplate = {
    id: "template",
    name: "Old",
    type: "expense",
    amount: 10,
    currency: "UYU",
    paymentType: "credit",
    creditCardId: data.creditCards[0].id,
    accountId: data.accounts[0].id,
  };
  const result = prepareTemplateDraft(template, data);
  expect(result.value.accountId).toBeUndefined();
  expect(result.value.creditCardId).toBeUndefined();
  expect(result.value.paymentType).toBe("debit");
});
test("editing a template explicitly clears optional values rather than retaining old fields", () => {
  const value = templateReplacementPatch({
    name: "New",
    type: "income",
    amount: 20,
    currency: "UYU",
    paymentType: "cash",
  });
  expect(value.accountId).toBeNull();
  expect(value.creditCardId).toBeNull();
  expect(value.note).toBeNull();
  expect(value.categoryId).toBeNull();
});

test("an archived card cannot silently turn a purchase into a debit from its saved bank account", () => {
  const data = structuredClone(mockWalletData);
  data.creditCards = [{ ...testCard, isActive: false }];
  const result = prepareTemplateDraft(
    {
      id: "template",
      name: "Card purchase",
      type: "expense",
      amount: 10,
      currency: "UYU",
      paymentType: "credit",
      accountId: data.accounts[0].id,
      creditCardId: testCard.id,
      categoryId: data.categories[0].id,
    },
    data,
  );
  expect(result.value.accountId).toBeUndefined();
  expect(result.value.creditCardId).toBeUndefined();
  expect(result.problems.join(" ")).toContain("choose a payment destination");
});

test("an archived linked bank account cannot silently turn a purchase into card-only", () => {
  const data = structuredClone(mockWalletData);
  data.creditCards = [testCard];
  data.accounts[0].isActive = false;
  const result = prepareTemplateDraft(
    {
      id: "template",
      name: "Bank and card",
      type: "expense",
      amount: 10,
      currency: "UYU",
      paymentType: "credit",
      accountId: data.accounts[0].id,
      creditCardId: testCard.id,
      categoryId: data.categories[0].id,
    },
    data,
  );
  expect(result.value.accountId).toBeUndefined();
  expect(result.value.creditCardId).toBeUndefined();
  expect(result.problems.join(" ")).toContain("explicitly");
});
