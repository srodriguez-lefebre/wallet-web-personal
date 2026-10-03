import { expect, test } from "vitest";
import {
  parseCsv,
  recordsCsv,
  prepareCsvRecords,
  importRecordBatches,
} from "./record-import";
import { mockWalletData } from "../../shared/mock-data";

test("quoted CSV preserves newlines, quotes, commas, CRLF and BOM", () => {
  expect(
    parseCsv('\uFEFFdate,note\r\n2026-01-01,"line 1, ""quote""\r\nline 2"\r\n'),
  ).toEqual([{ date: "2026-01-01", note: 'line 1, "quote"\r\nline 2' }]);
  expect(() => parseCsv('a,b\n1,"unterminated')).toThrow(/quote/i);
});

test("CSV roundtrip preserves currency, account amount and frozen exchange rate", () => {
  const dataset = structuredClone(mockWalletData);
  const record = {
    ...dataset.records[0],
    currency: "USD" as const,
    amount: 10,
    accountAmount: 410,
    exchangeRateToPrimary: 41,
    note: 'a, "quote"\nnext',
  };
  dataset.records = [];
  const preview = prepareCsvRecords(
    recordsCsv([record]),
    dataset,
    record.accountId!,
    record.categoryId!,
    record.categoryId!,
  );
  expect(preview[0].error).toBeUndefined();
  expect(preview[0].record).toMatchObject({
    currency: "USD",
    amount: 10,
    accountAmount: 410,
    exchangeRateToPrimary: 41,
    note: record.note,
  });
});

test("unknown FX cannot silently become UYU or use a fabricated rate", () => {
  const dataset = { ...mockWalletData, records: [], exchangeRates: [] };
  const preview = prepareCsvRecords(
    "date,type,amount,currency\n2026-01-01,expense,10,EUR",
    dataset,
    dataset.accounts[0].id,
    dataset.categories[0].id,
    dataset.categories[0].id,
  );
  expect(preview[0].error).toMatch(/rate/i);
});

test("CSV export of unresolved activity does not assign the default bank account on reimport", () => {
  const dataset = { ...mockWalletData, records: [] };
  const record = {
    ...mockWalletData.records[0],
    accountId: undefined,
    categoryId: undefined,
    paymentStatus: "needs_review" as const,
  };
  const preview = prepareCsvRecords(
    recordsCsv([record]),
    dataset,
    dataset.accounts[0].id,
    dataset.categories[0].id,
    dataset.categories[0].id,
  );
  expect(preview[0].record?.accountId).toBeUndefined();
  expect(preview[0].record?.categoryId).toBeUndefined();
  expect(preview[0].record?.paymentStatus).toBe("needs_review");
});

test("CSV roundtrip preserves and validates the debt payment link", () => {
  const debtId = "00000000-0000-4000-8000-000000000001";
  const dataset = {
    ...mockWalletData,
    records: [],
    debts: [{ ...mockWalletData.debts[0], id: debtId }],
  };
  const record = { ...mockWalletData.records[0], debtId };
  const preview = prepareCsvRecords(
    recordsCsv([record]),
    dataset,
    dataset.accounts[0].id,
    dataset.categories[0].id,
    dataset.categories[0].id,
  );
  expect(preview[0].record?.debtId).toBe(debtId);
  expect(
    prepareCsvRecords(
      recordsCsv([{ ...record, debtId: "invalid" }]),
      dataset,
      dataset.accounts[0].id,
      dataset.categories[0].id,
      dataset.categories[0].id,
    )[0].error,
  ).toBeTruthy();
});

test("an explicit frozen primary rate can supply the primary-currency account conversion", () => {
  const dataset = { ...mockWalletData, records: [], exchangeRates: [] };
  const preview = prepareCsvRecords(
    "date,type,amount,currency,exchangeRateToPrimary\n2026-01-01,expense,10,USD,41",
    dataset,
    dataset.accounts[0].id,
    dataset.categories[0].id,
    dataset.categories[0].id,
  );
  expect(preview[0].error).toBeUndefined();
  expect(preview[0].record?.accountAmount).toBe(410);
});

test("imports 201+ records in batches and deduplicates both complete history and file", async () => {
  const base = mockWalletData.records[0];
  const records = Array.from({ length: 202 }, (_, i) => ({
    ...base,
    counterpartyName: `row ${i}`,
  }));
  const sizes: number[] = [];
  const count = await importRecordBatches(
    [...records, records[1]],
    [records[0]],
    async (rows) => {
      sizes.push(rows.length);
      return rows.map((r, i) => ({ ...r, id: String(i) }));
    },
  );
  expect(sizes).toEqual([200, 1]);
  expect(count).toBe(201);
});

test("partial failure states the confirmed imported count", async () => {
  const records = Array.from({ length: 201 }, (_, i) => ({
    ...mockWalletData.records[0],
    counterpartyName: `row ${i}`,
  }));
  let call = 0;
  await expect(
    importRecordBatches(records, [], async (rows) => {
      if (++call === 2) throw new Error("offline");
      return rows.map((r, i) => ({ ...r, id: String(i) }));
    }),
  ).rejects.toThrow(/200.*201/);
});
