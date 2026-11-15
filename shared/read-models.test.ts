import { expect, test } from "vitest";

import { accountModelSchema, goalModelSchema, walletRecordModelSchema } from "./read-models";
import { accountPatchSchema, recordPatchSchema, walletRecordResponseSchema } from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";
test("inferred entity models preserve defaults and legacy optional read fields", () => {
  expect(
    accountModelSchema.parse({
      id,
      name: "Synthetic bank",
      type: "bank",
      currency: "UYU",
      initialBalance: 0,
      color: "blue",
      icon: "bank",
      isActive: true,
      isVisible: true,
    }),
  ).toMatchObject({ isActive: true, isVisible: true });
  expect(
    goalModelSchema.parse({
      id,
      name: "Synthetic goal",
      targetAmount: 100,
      currency: "UYU",
      color: "blue",
      icon: "bank",
      status: "active",
    }),
  ).toMatchObject({ tagIds: [], status: "active" });
  const record = {
    id,
    type: "expense",
    amount: 10,
    currency: "UYU",
    paymentType: "debit",
    paymentStatus: "needs_review",
    exchangeRateToPrimary: 0,
    occurredAt: "2026-06-01T12:00:00Z",
    tagIds: [],
  };
  expect(walletRecordModelSchema.parse(record)).toMatchObject({
    paymentStatus: "needs_review",
    exchangeRateToPrimary: 0,
  });
  expect(walletRecordResponseSchema.parse(record)).toMatchObject({
    goalIds: [],
    goalAssociations: [],
  });
});
test("split patches retain nullable clearing and reject an empty update", () => {
  expect(accountPatchSchema.parse({ note: null })).toEqual({ note: null });
  expect(recordPatchSchema.parse({ categoryId: null, note: null })).toEqual({
    categoryId: null,
    note: null,
  });
  expect(accountPatchSchema.safeParse({}).success).toBe(false);
  expect(accountPatchSchema.safeParse({ name: null }).success).toBe(false);
});
