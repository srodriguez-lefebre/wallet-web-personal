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

test("a model suggestion can be selected without saving or enabling automatic application", () => {
  const record = walletRecordResponseSchema.parse({
    ...syntheticRecord,
    categoryId: undefined,
    paymentStatus: "needs_review",
    importMerchant: "Fixture coffee bar",
    suggestedCategoryId: syntheticRecord.id,
  });
  const dataset = walletDatasetSchema.parse({
    ...reference,
    categories: [{ id: syntheticRecord.id, name: "Coffee shops", color: "blue", icon: "coffee" }],
    records: [record],
    creditCardRecords: [],
    creditCardStatements: [],
    creditCardPayments: [],
    creditCardPaymentAllocations: [],
  });
  const saveReview = vi.fn().mockResolvedValue(undefined);
  const model: RecordRowModel = {
    dataset,
    merchantCorrections: new Map(),
    loadRecord: vi.fn(),
    reviewSeenThrough: 0,
    runAction: createActionToastRunner(() => {}),
    deleteRecord: vi.fn(),
    reviewCategories: dataset.categories,
    reviewWrite: undefined,
    saveReview,
  };
  const { rerender } = render(
    <RecordRow record={record} model={model} indexes={buildRecordIndexes(dataset)} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /use ai suggestion.*coffee shops/i }));
  expect(saveReview).not.toHaveBeenCalled();
  expect(
    screen.getByRole<HTMLInputElement>("checkbox", { name: /apply this category/i }).checked,
  ).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  expect(saveReview).toHaveBeenCalledExactlyOnceWith(record, { categoryId: syntheticRecord.id });

  const updatedDataset = walletDatasetSchema.parse({
    ...dataset,
    categories: [
      ...dataset.categories,
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Brunch",
        color: "blue",
        icon: "coffee",
        parentId: syntheticRecord.id,
      },
    ],
  });
  rerender(
    <RecordRow
      record={record}
      model={{ ...model, dataset: updatedDataset, reviewCategories: updatedDataset.categories }}
      indexes={buildRecordIndexes(updatedDataset)}
    />,
  );
  expect(screen.queryByRole("button", { name: /use ai suggestion/i })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save category" }).disabled).toBe(
    true,
  );
});
