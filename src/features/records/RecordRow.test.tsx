// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { walletDatasetSchema, walletRecordResponseSchema } from "@shared/schemas";

import { RecordRow, type RecordRowModel } from "./RecordRow";
import { buildRecordIndexes } from "./record-indexes";

import { createActionToastRunner } from "@/lib/action-toast-runner";
import { reference, record as syntheticRecord } from "@/test/wallet-fixtures";

afterEach(cleanup);

test.each(["#ffffff", "#000000"])(
  "credit badges have a readable foreground for card color %s",
  (color) => {
    const record = walletRecordResponseSchema.parse({
      ...syntheticRecord,
      paymentType: "credit",
      creditCardId: syntheticRecord.id,
    });
    const dataset = walletDatasetSchema.parse({
      ...reference,
      records: [record],
      creditCardRecords: [],
      creditCardStatements: [],
      creditCardPayments: [],
      creditCardPaymentAllocations: [],
      creditCards: [
        {
          id: record.id,
          name: "Synthetic card",
          issuer: "Synthetic issuer",
          lastFour: "1111",
          creditLimit: 1000,
          limitCurrency: "UYU",
          closingDay: 3,
          dueDay: 12,
          color,
          icon: "credit-card",
          isActive: true,
        },
      ],
    });
    const model: RecordRowModel = {
      dataset,
      merchantCorrections: new Map(),
      loadRecord: vi.fn(),
      reviewSeenThrough: 0,
      runAction: createActionToastRunner(() => {}),
      deleteRecord: vi.fn(),
      reviewCategories: [],
      reviewWrite: undefined,
      saveReview: vi.fn(),
    };
    render(<RecordRow record={record} model={model} indexes={buildRecordIndexes(dataset)} />);
    const badge = screen.getByText("Credit", { exact: true });
    expect(badge.style.backgroundColor).toBe(
      color === "#ffffff" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
    );
    expect(badge.style.color).toBe(color === "#ffffff" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
  },
);
test("the native edit button has no nested controls and deleting does not open the record", async () => {
  const record = walletRecordResponseSchema.parse(syntheticRecord);
  const dataset = walletDatasetSchema.parse({
    ...reference,
    records: [record],
    creditCardRecords: [],
    creditCardStatements: [],
    creditCardPayments: [],
    creditCardPaymentAllocations: [],
  });
  const model: RecordRowModel = {
    dataset,
    merchantCorrections: new Map(),
    loadRecord: vi.fn(),
    reviewSeenThrough: 0,
    runAction: createActionToastRunner(() => {}),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    reviewCategories: [],
    reviewWrite: undefined,
    saveReview: vi.fn().mockResolvedValue(undefined),
  };
  render(<RecordRow record={record} model={model} indexes={buildRecordIndexes(dataset)} />);
  const edit = screen.getByRole("button", { name: /Uncategorized/ });
  expect(edit.tagName).toBe("BUTTON");
  expect(edit.querySelector("button,input,select,a")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Delete record" }));
  await waitFor(() => expect(model.deleteRecord).toHaveBeenCalledWith(record.id));
  expect(model.loadRecord).not.toHaveBeenCalled();
  fireEvent.click(edit);
  expect(model.loadRecord).toHaveBeenCalledExactlyOnceWith(record);
});
