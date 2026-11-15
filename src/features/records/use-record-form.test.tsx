// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { mockWalletData } from "@shared/mock-data";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useRecordForm } from "./use-record-form";

import type { FormEvent } from "react";
import type { WalletDataset } from "@shared/types";

import { createActionToastRunner } from "@/lib/action-toast-runner";
import { withWalletMetadata } from "@/test/legacy-wallet-view";

const update = vi.hoisted(() => vi.fn());
let dataset: WalletDataset;
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () =>
    withWalletMetadata({
      dataset,
      recordFilters: {},
      updateRecord: update,
      addRecord: vi.fn(),
      deleteRecord: vi.fn(),
      newRecordRequestId: 0,
      consumeNewRecordRequest: vi.fn(),
    }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({ toast: null, runAction: createActionToastRunner(() => {}) }),
}));
beforeEach(() => {
  dataset = structuredClone(mockWalletData);
  dataset.goals = [];
  dataset.creditCardRecords = [];
  dataset.records = [
    {
      ...dataset.records[0]!,
      type: "expense",
      currency: "EUR",
      amount: 100,
      accountId: dataset.accounts[0]!.id,
      accountAmount: 4500,
      exchangeRateToPrimary: 45,
      categoryId: dataset.categories[0]!.id,
      creditCardId: undefined,
      paymentType: "debit",
      paymentStatus: "cleared",
      occurredAt: "2026-02-01T12:34:56.789Z",
      tagIds: [],
      goalIds: [],
      goalAssociations: [],
    },
  ];
  dataset.accounts[0]!.currency = "UYU";
  update
    .mockReset()
    .mockImplementation((_id, patch) => Promise.resolve({ ...dataset.records[0], ...patch }));
});
afterEach(cleanup);

test("an open editor retains its frozen original when filtering or paging removes the row", async () => {
  const original = structuredClone(dataset.records[0]!);
  const { result, rerender } = renderHook(useRecordForm);
  act(() => result.current.loadRecord(original));
  dataset = { ...dataset, records: [] };
  rerender();
  expect(result.current.editingRecord).toMatchObject({
    id: original.id,
    occurredAt: original.occurredAt,
    accountAmount: 4500,
  });
  act(() =>
    result.current.setDraft((current) => ({ ...current, amount: "200", accountAmount: "9000" })),
  );
  await act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as FormEvent));
  expect(update).toHaveBeenCalledWith(
    original.id,
    expect.objectContaining({
      amount: 200,
      accountAmount: 9000,
      exchangeRateToPrimary: 45,
      occurredAt: original.occurredAt,
    }),
  );
});

test("linked refund metadata stays protected without any global card ledger", () => {
  const original = {
    ...dataset.records[0]!,
    type: "income" as const,
    linkedCardRecordKind: "refund" as const,
  };
  const { result, rerender } = renderHook(useRecordForm);
  act(() => result.current.loadRecord(original));
  dataset = { ...dataset, records: [] };
  rerender();
  expect(Boolean(result.current.editingLinkedRefund)).toBe(true);
  expect(result.current.editingRecord?.linkedCardRecordKind).toBe("refund");
});

test("duplicate uses the open snapshot after the source leaves the active page", () => {
  const original = dataset.records[0]!;
  const { result, rerender } = renderHook(useRecordForm);
  act(() => result.current.loadRecord(original));
  dataset = { ...dataset, records: [] };
  rerender();
  act(() => result.current.duplicateEditingRecord());
  expect(result.current.editingId).toBeNull();
  expect(result.current.amount).toBe("100");
  expect(result.current.currency).toBe("EUR");
  expect(result.current.accountAmount).toBe("");
});

vi.mock("@/hooks/wallet-entities", async () => {
  const { legacyEntityHooks } = await import("@/test/legacy-wallet-view");
  const { useWallet } = await import("@/providers/wallet-provider");
  return legacyEntityHooks(useWallet);
});
