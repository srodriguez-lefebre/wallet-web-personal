import { describe, expect, it } from "vitest";
import { creditCardPaymentSchema, creditCardRecordSchema, recordFiltersSchema, recordSchema } from "./schemas";

const categoryId = "00000000-0000-4000-8000-000000000001";
const cardId = "00000000-0000-4000-8000-000000000002";
const accountId = "00000000-0000-4000-8000-000000000003";

const baseRecord = {
  type: "expense" as const,
  amount: 100,
  currency: "UYU" as const,
  categoryId,
  tagIds: [],
  paymentType: "credit" as const,
  paymentStatus: "cleared" as const,
  exchangeRateToPrimary: 1,
  occurredAt: "2026-06-19T12:00:00.000Z",
};

describe("credit-card validation", () => {
  it("requires a category and limit conversion for a card movement", () => {
    const result = recordSchema.safeParse({
      ...baseRecord,
      categoryId: undefined,
      creditCardId: cardId,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([
        "categoryId",
        "amountInLimitCurrency",
        "exchangeRateToLimitCurrency",
      ]),
    );
  });

  it("accepts a categorized card-only movement independent from accounts", () => {
    expect(
      creditCardRecordSchema.safeParse({
        kind: "purchase",
        amount: 100,
        currency: "UYU",
        categoryId,
        amountInLimitCurrency: 2.5,
        exchangeRateToLimitCurrency: 0.025,
        accountImpactAtCreation: false,
        occurredAt: baseRecord.occurredAt,
      }).success,
    ).toBe(true);
  });

  it("keeps legacy account-backed credit records editable", () => {
    expect(
      recordSchema.safeParse({
        ...baseRecord,
        accountId,
      }).success,
    ).toBe(true);
  });

  it("requires the account-side amount only for account-funded payments", () => {
    const payment = {
      amount: 100,
      currency: "USD" as const,
      amountInLimitCurrency: 3_900,
      occurredAt: "2026-06-19T12:00:00.000Z",
    };

    expect(creditCardPaymentSchema.safeParse(payment).success).toBe(true);
    expect(
      creditCardPaymentSchema.safeParse({
        ...payment,
        accountId,
      }).success,
    ).toBe(false);
    expect(
      creditCardPaymentSchema.safeParse({
        ...payment,
        accountId,
        accountAmount: 100,
      }).success,
    ).toBe(true);
  });
});

describe("record filters", () => {
  it("coerces a bounded page limit", () => {
    expect(recordFiltersSchema.parse({ limit: "200" }).limit).toBe(200);
    expect(recordFiltersSchema.safeParse({ limit: "501" }).success).toBe(false);
  });

  it("rejects invalid or reversed date ranges", () => {
    expect(recordFiltersSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(recordFiltersSchema.safeParse({ from: "2026-06-20", to: "2026-06-01" }).success).toBe(false);
  });
});
