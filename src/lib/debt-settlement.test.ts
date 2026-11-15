import { expect, test } from "vitest";
import { mockWalletData } from "@shared/mock-data";

import { createDebtPayment, createDebtSettlement } from "./debt-settlement";

import type { ClientInput } from "@/services/api-client";

test("a partial retry keeps its payload when refreshed debt metadata changes the save-account default", async () => {
  const requests: ClientInput<"debts.pay">[] = [];
  const pay = createDebtPayment(async (input) => {
    requests.push(input);
    if (requests.length === 1) throw new Error("Synthetic response lost");
  });
  const body = { amount: 20, accountId: "synthetic-bank", occurredAt: "2026-11-14T15:00:00Z" };
  await expect(pay("synthetic-debt", { ...body, saveAccountToDebt: true })).rejects.toThrow(
    "response lost",
  );
  await pay("synthetic-debt", { ...body, saveAccountToDebt: false });
  expect(requests[1]).toEqual(requests[0]);
});

test("settlement retries preserve the exact request and confirmed identical settlements receive new keys", async () => {
  const requests: ClientInput<"debts.pay">[] = [];
  let first = true;
  const settle = createDebtSettlement(async (input) => {
    requests.push(input);
    if (first) {
      first = false;
      throw new Error("Synthetic uncertain payment");
    }
  });
  const debt = { ...mockWalletData.debts[0]!, accountId: "synthetic-bank", pendingAmount: 20 };
  await expect(settle(debt)).rejects.toThrow("Synthetic uncertain payment");
  await settle(debt);
  expect(requests[1]).toEqual(requests[0]);
  await settle(debt);
  expect(requests[2]!.body.idempotencyKey).not.toBe(requests[0]!.body.idempotencyKey);
});
test("concurrent settlement entry points share one pending request", async () => {
  let release!: () => void;
  const requests: ClientInput<"debts.pay">[] = [];
  const settle = createDebtSettlement((input) => {
    requests.push(input);
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const debt = { ...mockWalletData.debts[0]!, accountId: "synthetic-bank", pendingAmount: 20 };
  const first = settle(debt),
    second = settle(debt);
  expect(requests).toHaveLength(1);
  release();
  await Promise.all([first, second]);
});
