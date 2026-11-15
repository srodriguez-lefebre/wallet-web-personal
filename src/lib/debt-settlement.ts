import { localDateInput } from "./date-input";

import type { Debt } from "@shared/types";
import type { ClientInput } from "@/services/api-client";

type Payment = ClientInput<"debts.pay">;

/** Shared by every settlement entry point for this session, including uncertain retries. */
export function createDebtSettlement(write: (input: Payment) => Promise<unknown>) {
  const requests = new Map<string, Payment>();
  const pending = new Map<string, Promise<void>>();
  return (debt: Debt, occurredAt = new Date().toISOString()): Promise<void> => {
    if (!debt.accountId || debt.pendingAmount === undefined || debt.pendingAmount <= 0)
      return Promise.resolve();
    const fingerprint = JSON.stringify([
      debt.id,
      debt.pendingAmount,
      debt.accountId,
      debt.direction,
      localDateInput(occurredAt),
    ]);
    const active = pending.get(fingerprint);
    if (active) return active;
    const input = requests.get(fingerprint) ?? {
      params: { id: debt.id },
      body: {
        amount: debt.pendingAmount,
        accountId: debt.accountId,
        occurredAt,
        note:
          debt.direction === "receivable"
            ? `Full debt received: ${debt.name}`
            : `Full debt paid: ${debt.name}`,
        saveAccountToDebt: true,
        idempotencyKey: crypto.randomUUID(),
      },
    };
    requests.set(fingerprint, input);
    const result = (async () => {
      await write(input);
      requests.delete(fingerprint);
    })().finally(() => pending.delete(fingerprint));
    pending.set(fingerprint, result);
    return result;
  };
}
