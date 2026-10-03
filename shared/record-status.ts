import type { WalletRecord } from "./types.js";

/** A review item is a draft until its account, category and conversions are validated. */
export function isFinancialRecord(record: Pick<WalletRecord,"paymentStatus">) {
  return record.paymentStatus!=="cancelled"&&record.paymentStatus!=="needs_review";
}
