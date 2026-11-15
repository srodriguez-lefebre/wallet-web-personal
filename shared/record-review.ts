import type { Category, WalletDataset, WalletRecord } from "./types.js";

export const categoryImportWarning =
  "Category could not be determined automatically; review this expense.";

export function isReviewCategory<T extends Pick<Category, "name"> & { systemKey?: string | null }>(
  category: T | undefined,
): category is T {
  return Boolean(
    category &&
    (category.systemKey
      ? !["unknown_expense", "category_eliminated", "others"].includes(category.systemKey)
      : !["unknown expense", "others", "category eliminated"].includes(
          category.name.trim().toLowerCase(),
        )),
  );
}

/** Older backups stored these diagnostics in the editable note. */
export function splitImportNote(note: string | undefined) {
  if (!note) return { note, history: [] as string[] };
  const parts = note.split(" | ");
  const imported = /^(Auto Itaú|Auto Wallet|Imported from )/.test(parts[0] ?? "");
  if (!imported) return { note, history: [] as string[] };
  const history = parts.filter(
    (part) =>
      part === categoryImportWarning ||
      part.startsWith("Bank account mapping unavailable;") ||
      part.startsWith("Unknown account: ") ||
      part.startsWith("Unknown card: ") ||
      part.startsWith("Currency conversion unavailable;"),
  );
  return {
    note: history.length ? parts.filter((part) => !history.includes(part)).join(" | ") : note,
    history,
  };
}

export function recordReviewDate(record: WalletRecord) {
  return record.createdAt ?? record.occurredAt;
}

export function countNewReviews(dataset: WalletDataset) {
  const seenThrough = Date.parse(dataset.settings.reviewSeenThrough ?? "") || 0;
  return dataset.records.filter(
    (record) =>
      record.paymentStatus === "needs_review" && Date.parse(recordReviewDate(record)) > seenThrough,
  ).length;
}

export function currentReviewIssues(record: WalletRecord, dataset: WalletDataset) {
  const account = dataset.accounts.find((item) => item.id === record.accountId);
  const destination = dataset.accounts.find((item) => item.id === record.destinationAccountId);
  const card = dataset.creditCards.find((item) => item.id === record.creditCardId);
  const issues: string[] = [];
  if (
    record.linkedCardRecordKind === "refund" ||
    dataset.creditCardRecords.some(
      (item) => item.walletRecordId === record.id && item.kind === "refund",
    )
  ) {
    issues.push("Review the linked refund in Cards");
  }
  if ((record.accountId && !account?.isActive) || (!account && !card))
    issues.push("Assign an active account");
  if (
    (record.creditCardId || (record.importMerchant && record.paymentType === "credit")) &&
    !card?.isActive
  ) {
    issues.push("Assign an active card");
  }
  if (record.type === "transfer" && (!destination?.isActive || destination.id === account?.id)) {
    issues.push("Assign a different destination account");
  }
  if (
    record.exchangeRateToPrimary <= 0 ||
    (account && account.currency !== record.currency && !record.accountAmount) ||
    (destination && destination.currency !== record.currency && !record.destinationAmount) ||
    (card && (!record.amountInLimitCurrency || !record.exchangeRateToLimitCurrency))
  ) {
    issues.push("Complete the currency conversion");
  }
  return issues;
}

export function normalizeBankMerchant(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
}

export function getMerchantCorrections(dataset: WalletDataset) {
  return selectMerchantCorrections(dataset.records, dataset.categories);
}

type MerchantCorrectionRecord = Pick<
  WalletRecord,
  | "id"
  | "type"
  | "paymentType"
  | "paymentStatus"
  | "categoryId"
  | "importMerchant"
  | "merchantCorrection"
>;
export function selectMerchantCorrections<R extends MerchantCorrectionRecord>(
  records: R[],
  categories: Category[],
) {
  const corrections = new Map<string, { record: R; category: Category }>();
  for (const record of records) {
    if (
      !record.importMerchant ||
      !record.merchantCorrection ||
      record.type !== "expense" ||
      record.paymentType === "transfer" ||
      record.paymentStatus === "cancelled"
    )
      continue;
    const category = categories.find((item) => item.id === record.categoryId);
    if (!isReviewCategory(category)) continue;
    const merchant = normalizeBankMerchant(record.importMerchant);
    const previous = corrections.get(merchant)?.record;
    const savedAt = record.merchantCorrection.savedAt;
    if (
      previous &&
      (previous.merchantCorrection!.savedAt > savedAt ||
        (previous.merchantCorrection!.savedAt === savedAt && previous.id > record.id))
    )
      continue;
    corrections.set(merchant, { record, category });
  }
  return corrections;
}
