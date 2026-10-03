import { expect, test } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import {
  walletDataHealth,
  summarizeCsvPreview,
  backupFilename,
  rememberBackupExport,
  readBackupReceipt,
} from "./data-health";

test("diagnostics retain archived dictionaries and ignore archived records", () => {
  const data = structuredClone(mockWalletData);
  data.creditCardRecords = [];
  data.records = [
    {
      ...data.records[0],
      id: "history",
      type: "expense",
      categoryId: undefined,
      paymentStatus: "cleared",
    },
    Object.assign(
      {
        ...data.records[0],
        id: "archived",
        paymentStatus: "needs_review" as const,
      },
      { deletedAt: "2026-01-01T12:00:00Z" },
    ),
  ];
  Object.assign(data.accounts[0], { deletedAt: "2026-01-01T12:00:00Z" });
  const result = walletDataHealth(data);
  expect(result.review).toBe(0);
  expect(result.uncategorized).toBe(1);
  expect(result.references).toBe(0);
});
test("conversion checks exclude drafts and count affected records once", () => {
  const data = structuredClone(mockWalletData),
    account = data.accounts[0];
  account.currency = "UYU";
  data.creditCardRecords = [];
  data.records = [
    {
      ...data.records[0],
      id: "missing",
      type: "expense",
      accountId: account.id,
      currency: "USD",
      accountAmount: undefined,
      paymentStatus: "cleared",
    },
    {
      ...data.records[0],
      id: "draft",
      accountId: account.id,
      currency: "USD",
      accountAmount: undefined,
      paymentStatus: "needs_review",
    },
  ];
  const result = walletDataHealth(data);
  expect(result.conversions).toBe(1);
  expect(result.review).toBe(1);
  data.records[0].accountAmount = 400;
  expect(walletDataHealth(data).conversions).toBe(0);
});
test("CSV preview totals keep currencies and directions separate and skip invalid rows", () => {
  const record = mockWalletData.records[0];
  expect(
    summarizeCsvPreview([
      {
        rowNumber: 2,
        record: { ...record, type: "expense", amount: 10, currency: "USD" },
      },
      {
        rowNumber: 3,
        record: { ...record, type: "income", amount: 400, currency: "UYU" },
      },
      { rowNumber: 4, error: "Duplicate" },
    ]),
  ).toEqual({
    ready: 2,
    skipped: 1,
    totals: [
      { currency: "USD", income: 0, expenses: 10, transfers: 0 },
      { currency: "UYU", income: 400, expenses: 0, transfers: 0 },
    ],
  });
});
test("backup filenames contain timestamps that are valid on Windows", () => {
  expect(backupFilename(new Date("2026-10-03T12:34:56.789Z"))).toBe(
    "wallet-backup-2026-10-03T12-34-56-789Z.json",
  );
});
test("backup receipt contains only export date and counts", () => {
  const saved = rememberBackupExport(
    mockWalletData,
    new Date("2026-10-03T12:00:00Z"),
  );
  expect(saved).toEqual({
    requestedAt: "2026-10-03T12:00:00.000Z",
    records: mockWalletData.records.length,
    cardRecords: mockWalletData.creditCardRecords.length,
  });
  expect(readBackupReceipt()).toBeNull();
});
