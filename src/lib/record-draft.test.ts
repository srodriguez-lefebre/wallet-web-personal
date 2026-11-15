import { expect, test } from "vitest";
import { walletDatasetSchema, goalResponseSchema } from "@shared/schemas";

import { reference } from "../test/wallet-fixtures";
import {
  emptyDraft,
  draftFromRecord,
  duplicateDraft,
  buildRecordPatch,
  buildRecordInput,
  scaleDraftAmount,
  draftFromTemplate,
} from "./record-draft";

import type { WalletRecord, RecordTemplate } from "@shared/types";

const bank = "00000000-0000-4000-8000-000000000001",
  category = "00000000-0000-4000-8000-000000000002",
  goal = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-11-14T12:00:00.000Z");
function dataset() {
  return walletDatasetSchema.parse({
    ...reference,
    records: [],
    creditCardRecords: [],
    creditCardStatements: [],
    creditCardPayments: [],
    creditCardPaymentAllocations: [],
    accounts: [
      {
        id: bank,
        name: "Synthetic bank",
        type: "bank",
        currency: "UYU",
        initialBalance: 1000,
        color: "#123456",
        icon: "bank",
        isActive: true,
        isVisible: true,
      },
    ],
    categories: [{ id: category, name: "Synthetic category", color: "#123456", icon: "tag" }],
    exchangeRates: [
      {
        id: "00000000-0000-4000-8000-000000000005",
        fromCurrency: "USD",
        toCurrency: "UYU",
        rate: 50,
        date: "2026-11-01T00:00:00.000Z",
      },
    ],
  });
}
function record(patch: Partial<WalletRecord> = {}): WalletRecord {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    type: "expense",
    amount: 10,
    currency: "USD",
    accountId: bank,
    accountAmount: 400,
    categoryId: category,
    tagIds: [],
    goalIds: [],
    goalAssociations: [],
    paymentType: "debit",
    paymentStatus: "cleared",
    exchangeRateToPrimary: 40,
    occurredAt: "2026-11-01T13:14:15.123Z",
    ...patch,
  };
}
test("unchanged financial fields retain frozen conversions and the exact original timestamp", () => {
  const original = record();
  const draft = { ...draftFromRecord(original), note: "Synthetic edit" };
  const result = buildRecordPatch(draft, original, dataset(), now);
  expect(result).toMatchObject({
    ok: true,
    mode: "full",
    patch: {
      amount: 10,
      accountAmount: 400,
      exchangeRateToPrimary: 40,
      occurredAt: original.occurredAt,
      note: "Synthetic edit",
      creditCardId: null,
    },
  });
});
test("amount edits scale frozen bank amounts without rounding drift across repeated changes", () => {
  const original = record({ amount: 3, accountAmount: 100 });
  const basis = { source: { amount: "3", converted: "100" } };
  const first = scaleDraftAmount(draftFromRecord(original), "1", basis);
  const second = scaleDraftAmount(first, "2", basis);
  expect(first.accountAmount).toBe("33.33");
  expect(second.accountAmount).toBe("66.67");
  expect(buildRecordPatch(second, original, dataset(), now)).toMatchObject({
    ok: true,
    patch: { amount: 2, accountAmount: 66.67, exchangeRateToPrimary: 40 },
  });
});
test("cancellation and unresolved review edits cannot rewrite frozen financial history", () => {
  const original = record({ exchangeRateToPrimary: 0, paymentStatus: "needs_review" });
  const draft = draftFromRecord(original);
  expect(
    buildRecordPatch(
      { ...draft, paymentStatus: "cancelled", amount: "" },
      original,
      dataset(),
      now,
    ),
  ).toEqual({ ok: true, mode: "cancel", patch: { paymentStatus: "cancelled" } });
  expect(
    buildRecordPatch({ ...draft, note: "Reviewed metadata" }, original, dataset(), now),
  ).toEqual({
    ok: true,
    mode: "review",
    patch: { categoryId: category, counterpartyName: null, note: "Reviewed metadata", tagIds: [] },
  });
  expect(
    buildRecordPatch(
      { ...draft, amount: "20" },
      original,
      { ...dataset(), exchangeRates: [] },
      now,
    ),
  ).toMatchObject({ ok: false });
});
test("linked card refunds only submit metadata and goal links", () => {
  const original = record({ type: "income" });
  const draft = { ...draftFromRecord(original), note: "Synthetic refund", amount: "999" };
  const result = buildRecordPatch(draft, original, dataset(), now, { linkedRefund: true });
  expect(result).toEqual({
    ok: true,
    mode: "refund",
    patch: {
      categoryId: category,
      counterpartyName: null,
      note: "Synthetic refund",
      tagIds: [],
      goalIds: [],
      goalAssociations: [],
    },
  });
});
test("invalid goal portions and missing conversions cannot create a misleading record", () => {
  const base = emptyDraft(dataset(), now);
  expect(
    buildRecordInput(
      { ...base, amount: "10", currency: "BRL", categoryId: category, primaryRate: "" },
      dataset(),
      undefined,
      now,
    ),
  ).toMatchObject({ ok: false });
  expect(
    buildRecordInput(
      {
        ...base,
        amount: "10",
        categoryId: category,
        goalAssociations: [
          {
            goalId: goal,
            allocatedAmount: 11,
            assignmentSource: "manual",
            useReserved: true,
            reserveIncome: true,
          },
        ],
      },
      dataset(),
      undefined,
      now,
    ),
  ).toMatchObject({ ok: false });
  expect(
    buildRecordInput(
      { ...base, amount: "10", categoryId: category, primaryRate: "1" },
      dataset(),
      undefined,
      now,
    ),
  ).toMatchObject({ ok: true, value: { amount: 10, accountAmount: 10, exchangeRateToPrimary: 1 } });
});
test("duplication uses a fresh date, preserves descriptive fields and recomputes current FX", () => {
  const original = record({ note: "Synthetic note", counterpartyName: "Synthetic merchant" });
  const data = dataset();
  const draft = duplicateDraft(original, data, now);
  expect(draft.note).toBe(original.note);
  expect(buildRecordInput(draft, data, undefined, now)).toMatchObject({
    ok: true,
    value: {
      amount: 10,
      accountAmount: 500,
      exchangeRateToPrimary: 50,
      occurredAt: now.toISOString(),
    },
  });
});

test("template drafts validate saved references and use the new date and conversions", () => {
  const data = dataset();
  const template: RecordTemplate = {
    id: goal,
    name: "Synthetic template",
    type: "expense",
    amount: 10,
    currency: "USD",
    accountId: bank,
    categoryId: category,
    paymentType: "debit",
  };
  const prepared = draftFromTemplate(template, data, now);
  expect(prepared.notice).toContain("Draft from template");
  expect(buildRecordInput(prepared.draft, data, undefined, now)).toMatchObject({
    ok: true,
    value: {
      amount: 10,
      accountAmount: 500,
      exchangeRateToPrimary: 50,
      occurredAt: now.toISOString(),
    },
  });
  const unavailable = draftFromTemplate({ ...template, accountId: goal }, data, now);
  expect(unavailable.draft.accountId).toBe("");
  expect(unavailable.notice).toContain("Choose an active account");
});

test("new and duplicated drafts select only today's automatic goal windows", () => {
  const data = dataset();
  data.goals = [
    goalResponseSchema.parse({
      id: goal,
      name: "Synthetic automatic goal",
      targetAmount: 100,
      currency: "UYU",
      color: "#123456",
      icon: "flag",
      autoCaptureEnabled: true,
      autoCaptureStart: "2026-11-01",
      autoCaptureEnd: "2026-11-30",
    }),
  ];
  const expected = [
    { goalId: goal, assignmentSource: "date_rule", useReserved: true, reserveIncome: true },
  ];
  expect(emptyDraft(data, now).goalAssociations).toEqual(expected);
  expect(duplicateDraft(record({ goalIds: [bank] }), data, now).goalAssociations).toEqual(expected);
  expect(emptyDraft(data, new Date("2026-12-01T12:00:00Z")).goalAssociations).toEqual([]);
});

test("duplicating a historical record requires choosing a new category when its category is protected", () => {
  const data = dataset();
  data.categories[0]!.systemKey = "category_eliminated";
  expect(duplicateDraft(record(), data, now).categoryId).toBe("");
  expect(draftFromRecord(record()).categoryId).toBe(category);
});
