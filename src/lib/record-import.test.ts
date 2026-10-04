import { expect, test } from "vitest";
import {
  parseCsv,
  recordsCsv,
  prepareCsvRecords,
  importRecordBatches,
} from "./record-import";
import { mockWalletData as originalMockData } from "../../shared/mock-data";
// Match the public API's UUID contract, including every fixture reference.
const replacements = new Map<string, string>();
let idNumber = 10;
const mockWalletData: typeof originalMockData = JSON.parse(
  JSON.stringify(originalMockData),
  (_key, value) => {
    if (
      typeof value !== "string" ||
      !/^(acc|cat|tag|rec|goal|debt|budget|inv|rate|plan|rdebt)-/.test(value)
    )
      return value;
    if (!replacements.has(value))
      replacements.set(
        value,
        `00000000-0000-4000-8000-${String(idNumber++).padStart(12, "0")}`,
      );
    return replacements.get(value);
  },
);

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

test("different timestamps on the same day remain distinct purchases", async () => {
  const first = {
    ...mockWalletData.records[0],
    occurredAt: "2026-01-01T10:00:00Z",
    counterpartyName: "Coffee",
  };
  const second = { ...first, occurredAt: "2026-01-01T14:00:00Z" };
  expect(
    await importRecordBatches([first, second], [], async (rows) =>
      rows.map((row, i) => ({ ...row, id: String(i) })),
    ),
  ).toBe(2);
});

test("CSV preview rejects a card payload that cannot pass the shared API schema", () => {
  const cardId = "00000000-0000-4000-8000-000000009999";
  const dataset = {
    ...mockWalletData,
    records: [],
    creditCards: [
      {
        id: cardId,
        name: "Test",
        issuer: "Test",
        lastFour: "1234",
        creditLimit: 1000,
        limitCurrency: "UYU" as const,
        closingDay: 20,
        dueDay: 25,
        color: "blue",
        icon: "card",
        isActive: true,
      },
    ],
  };
  const csv = `date,type,amount,currency,creditCardId,paymentType\n2026-01-01,expense,10,UYU,${cardId},debit`;
  const result = prepareCsvRecords(
    csv,
    dataset,
    dataset.accounts[0].id,
    dataset.categories[0].id,
    dataset.categories[0].id,
  );
  expect(result[0].error).toBeTruthy();
  expect(result[0].record).toBeUndefined();
});

test("a rejected row does not mark a later valid row as already imported", () => {
  const dataset = { ...mockWalletData, records: [] };
  const valid = { ...mockWalletData.records[0], tagIds: [] };
  const invalid = {
    ...valid,
    tagIds: [
      "00000000-0000-4000-8000-000000008881",
      "00000000-0000-4000-8000-000000008882",
    ],
  };
  const result = prepareCsvRecords(
    recordsCsv([invalid, valid]),
    dataset,
    dataset.accounts[0].id,
    dataset.categories[0].id,
    dataset.categories[0].id,
  );
  expect(result[0].error).toBeTruthy();
  expect(result[1].error).toBeUndefined();
});

test.each(["tagIds", "goalIds", "goalAssociations"] as const)("CSV preview rejects an unknown %s reference per row", (field) => {
  const unknownId = "00000000-0000-4000-8000-000000007777";
  const dataset = { ...mockWalletData, records: [] };
  const valid = { ...mockWalletData.records[0], tagIds: [], goalIds: [], goalAssociations: [] };
  const invalid = { ...valid, [field]: field === "goalAssociations" ? [{ goalId: unknownId, assignmentSource: "manual", useReserved: true, reserveIncome: true }] : [unknownId] };
  const result = prepareCsvRecords(recordsCsv([invalid, valid]), dataset, dataset.accounts[0].id, dataset.categories[0].id, dataset.categories[0].id);
  expect(result[0].error).toMatch(/does not exist/i);
  expect(result[0].record).toBeUndefined();
  expect(result[1].error).toBeUndefined();
});

test.each(["goalIds", "goalAssociations"] as const)("new %s links require active goals without invalidating unrelated historical links", (field) => {
  const dataset = structuredClone(mockWalletData);
  dataset.goals[0].status = "completed";
  const valid = { ...dataset.records[0], counterpartyName: "New CSV row", tagIds: [dataset.tags[0].id], goalIds: [], goalAssociations: [] };
  const invalid = { ...valid, [field]: field === "goalAssociations" ? [{ goalId: dataset.goals[0].id, assignmentSource: "manual", useReserved: true, reserveIncome: true }] : [dataset.goals[0].id] };
  const result = prepareCsvRecords(recordsCsv([invalid, valid]), dataset, dataset.accounts[0].id, dataset.categories[0].id, dataset.categories[0].id);
  expect(result[0].error).toMatch(/active goal/i);
  expect(result[1].error).toBeUndefined();
});
