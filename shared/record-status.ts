import type { WalletRecord } from "./types.js";

/** Review is an attention marker; only cancellation removes financial activity. */
export function isFinancialRecord(record: Pick<WalletRecord,"paymentStatus">) {
  return record.paymentStatus!=="cancelled";
}

/** A zero frozen rate represents an unresolved conversion, never a 1:1 quote. */
export function isPrimaryReportingRecord(record: Pick<WalletRecord,"paymentStatus"|"exchangeRateToPrimary">) {
  return isFinancialRecord(record) && Number.isFinite(record.exchangeRateToPrimary) && record.exchangeRateToPrimary > 0;
}
