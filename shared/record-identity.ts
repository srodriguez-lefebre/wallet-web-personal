import type { WalletRecord } from "./types.js";

/** Financial identity for explicit imports; distinct timestamps and conversions remain distinct. */
export function recordFingerprint(record: Omit<WalletRecord,"id">): string {
  const amount=(value:number|undefined,precision=2)=>value===undefined?null:value.toFixed(precision);
  return JSON.stringify([
    record.type,record.currency,amount(record.amount),record.accountId??null,amount(record.accountId?(record.accountAmount??record.amount):undefined),
    record.destinationAccountId??null,amount(record.destinationAccountId?(record.destinationAmount??record.amount):undefined),record.creditCardId??null,record.categoryId??null,
    new Date(record.occurredAt).toISOString(),(record.counterpartyName??"").trim().toLowerCase(),
    record.paymentType,record.paymentStatus,amount(record.exchangeRateToPrimary,6),amount(record.amountInLimitCurrency),amount(record.exchangeRateToLimitCurrency,6),record.debtId??null,
  ]);
}
