import { describe, expect, it } from "vitest";
import { creditCardPaymentSchema, recordSchema } from "./schemas";

const baseRecord = {
  type: "expense" as const,
  amount: 100,
  currency: "UYU" as const,
  categoryId: "category-1",
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
      creditCardId: "card-1",
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

  it("accepts a categorized card movement independent from accounts", () => {
    expect(
      recordSchema.safeParse({
        ...baseRecord,
        creditCardId: "card-1",
        amountInLimitCurrency: 2.5,
        exchangeRateToLimitCurrency: 0.025,
      }).success,
    ).toBe(true);
  });

  it("keeps legacy account-backed credit records editable", () => {
    expect(
      recordSchema.safeParse({
        ...baseRecord,
        accountId: "legacy-credit-account",
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
        accountId: "bank-1",
      }).success,
    ).toBe(false);
    expect(
      creditCardPaymentSchema.safeParse({
        ...payment,
        accountId: "bank-1",
        accountAmount: 100,
      }).success,
    ).toBe(true);
  });
});
