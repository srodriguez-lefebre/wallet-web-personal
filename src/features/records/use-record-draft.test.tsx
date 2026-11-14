// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { walletRecordResponseSchema } from "@shared/schemas";

import { useRecordDraft } from "./use-record-draft";

import { draftFromRecord } from "@/lib/record-draft";
import { record } from "@/test/wallet-fixtures";

test("draft setters remain stable and functional updates share the latest reducer state", () => {
  const initial = () => draftFromRecord(walletRecordResponseSchema.parse(record));
  const { result } = renderHook(() => useRecordDraft(initial));
  const amountSetter = result.current.setAmount;
  act(() => {
    result.current.setAmount("20");
    result.current.setGoalAssociations((current) => [
      ...current,
      {
        goalId: "synthetic-first",
        assignmentSource: "manual",
        useReserved: true,
        reserveIncome: true,
      },
    ]);
    result.current.setGoalAssociations((current) => [
      ...current,
      {
        goalId: "synthetic-second",
        assignmentSource: "manual",
        useReserved: true,
        reserveIncome: true,
      },
    ]);
  });
  expect(result.current.amount).toBe("20");
  expect(result.current.goalAssociations.map((item) => item.goalId)).toEqual([
    "synthetic-first",
    "synthetic-second",
  ]);
  expect(result.current.setAmount).toBe(amountSetter);
  act(() =>
    result.current.setDraft((current) => ({
      ...current,
      amount: "30",
      note: "Synthetic updated draft",
    })),
  );
  expect(result.current.draft).toMatchObject({ amount: "30", note: "Synthetic updated draft" });
  expect(result.current.setAmount).toBe(amountSetter);
});
