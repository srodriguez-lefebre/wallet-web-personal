import type { CurrencyCode, WalletDataset, WalletRecord } from "./types.js";
import { isFinancialRecord } from "./record-status.js";

const active = (row: object) =>
  !(row as { deletedAt?: string | null }).deletedAt;
const positive = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0;

/** Use a complete backup so archived dictionaries remain available for history. */
export function walletDataHealth(dataset: WalletDataset) {
  const records = dataset.records.filter(active),
    financial = records.filter(isFinancialRecord);
  const accounts = new Map(dataset.accounts.map((row) => [row.id, row]));
  const cards = new Map(dataset.creditCards.map((row) => [row.id, row]));
  const categories = new Set(dataset.categories.map((row) => row.id));
  const allRecordIds = new Set(dataset.records.map((row) => row.id));
  const allCardRecordIds = new Set(
    dataset.creditCardRecords.map((row) => row.id),
  );
  const conversionIssues = new Set<string>(),
    referenceIssues = new Set<string>();
  for (const record of financial) {
    const source = record.accountId
      ? accounts.get(record.accountId)
      : undefined;
    const destination = record.destinationAccountId
      ? accounts.get(record.destinationAccountId)
      : undefined;
    const card = record.creditCardId
      ? cards.get(record.creditCardId)
      : undefined;
    if (
      !positive(record.exchangeRateToPrimary) ||
      (source &&
        source.currency !== record.currency &&
        !positive(record.accountAmount)) ||
      (record.type === "transfer" &&
        destination &&
        destination.currency !== record.currency &&
        !positive(record.destinationAmount)) ||
      (card &&
        (!positive(record.amountInLimitCurrency) ||
          !positive(record.exchangeRateToLimitCurrency)))
    )
      conversionIssues.add(`record:${record.id}`);
    if (
      (record.accountId && !source) ||
      (record.destinationAccountId && !destination) ||
      (record.creditCardId && !card) ||
      (record.categoryId && !categories.has(record.categoryId))
    )
      referenceIssues.add(`record:${record.id}`);
  }
  for (const record of dataset.creditCardRecords.filter(active)) {
    if (
      !cards.has(record.creditCardId) ||
      !categories.has(record.categoryId) ||
      (record.walletRecordId && !allRecordIds.has(record.walletRecordId)) ||
      (record.originalRecordId &&
        !allCardRecordIds.has(record.originalRecordId)) ||
      (record.accountId && !accounts.has(record.accountId))
    )
      referenceIssues.add(`card:${record.id}`);
  }
  return {
    review: records.filter((row) => row.paymentStatus === "needs_review")
      .length,
    uncategorized: financial.filter(
      (row) => row.type !== "transfer" && !row.categoryId,
    ).length,
    conversions: conversionIssues.size,
    references: referenceIssues.size,
  };
}

export function summarizeCsvPreview<T extends {record?:Pick<WalletRecord,"type"|"amount"|"currency">}>(
  rows:ReadonlyArray<T>,
) {
  const groups = new Map<
    CurrencyCode,
    {
      currency: CurrencyCode;
      income: number;
      expenses: number;
      transfers: number;
    }
  >();
  let ready = 0;
  for (const row of rows) {
    if (!row.record) continue;
    ready += 1;
    const record = row.record;
    const group = groups.get(record.currency) ?? {
      currency: record.currency,
      income: 0,
      expenses: 0,
      transfers: 0,
    };
    const key =
      record.type === "expense"
        ? "expenses"
        : record.type === "income"
          ? "income"
          : "transfers";
    group[key] += record.amount;
    groups.set(record.currency, group);
  }
  return {
    ready,
    skipped: rows.length - ready,
    totals: [...groups.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
  };
}
