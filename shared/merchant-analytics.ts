import { recordsForDateRange } from "./calculations.js";
import { isFinancialRecord } from "./record-status.js";
import type { DateRange, WalletRecord } from "./types.js";

export interface MerchantSpending {
  key: string;
  name: string;
  purchases: number;
  total: number;
  average: number;
}

/** Gross wallet purchases at their frozen primary-currency conversion. */
export function calculateMerchantSpending(records: WalletRecord[], range: DateRange): MerchantSpending[] {
  const merchants = new Map<string, MerchantSpending>();
  for (const record of recordsForDateRange(records, range)) {
    if (record.type !== "expense" || !isFinancialRecord(record)) continue;
    const name = record.counterpartyName?.trim() || "Unspecified merchant";
    const key = record.counterpartyName?.trim().toLocaleLowerCase() || "";
    const merchant = merchants.get(key) ?? { key, name, purchases: 0, total: 0, average: 0 };
    merchant.purchases += 1;
    merchant.total += record.amount * record.exchangeRateToPrimary;
    merchants.set(key, merchant);
  }
  return [...merchants.values()]
    .map(merchant => ({ ...merchant, average: merchant.total / merchant.purchases }))
    .sort((a, b) => b.total - a.total || b.purchases - a.purchases || a.name.localeCompare(b.name));
}
