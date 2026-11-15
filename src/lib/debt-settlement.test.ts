import { expect, test } from "vitest";
import { mockWalletData } from "@shared/mock-data";

import { createDebtSettlement } from "./debt-settlement";

import type { ClientInput } from "@/services/api-client";

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
