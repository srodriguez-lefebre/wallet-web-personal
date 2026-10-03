import type {
  RecordTemplate,
  WalletDataset,
  WalletRecord,
} from "@shared/types";
import type { RecordTemplatePatch } from "@shared/schemas";
import { findExchangeRate } from "@shared/money";

export function templateFromRecord(
  record: WalletRecord,
  name: string,
): Omit<RecordTemplate, "id"> {
  return {
    name: name.trim(),
    type: record.type,
    amount: record.amount,
    currency: record.currency,
    accountId: record.accountId,
    creditCardId: record.type === "expense" ? record.creditCardId : undefined,
    destinationAccountId:
      record.type === "transfer" ? record.destinationAccountId : undefined,
    categoryId: record.type === "transfer" ? undefined : record.categoryId,
    tagId: record.tagIds[0],
    counterpartyName: record.counterpartyName,
    note: record.note,
    paymentType: record.type === "transfer" ? "transfer" : record.paymentType,
  };
}

export function prepareTemplateDraft(
  template: RecordTemplate,
  dataset: WalletDataset,
  now = new Date(),
) {
  const problems: string[] = [];
  let accountId =
    template.accountId &&
    dataset.accounts.some(
      (a) => a.id === template.accountId && a.isActive && a.isVisible,
    )
      ? template.accountId
      : undefined;
  let creditCardId =
    template.type === "expense" &&
    template.creditCardId &&
    dataset.creditCards.some(
      (c) => c.id === template.creditCardId && c.isActive,
    )
      ? template.creditCardId
      : undefined;
  const missingAccount = Boolean(template.accountId && !accountId);
  const missingCard = Boolean(template.creditCardId && !creditCardId);
  // Both destinations require review when one disappears: neither debit nor
  // card-only may silently replace a saved card+bank purchase.
  if (missingAccount || missingCard) {
    accountId = undefined;
    creditCardId = undefined;
  }
  const destinationAccountId =
    template.type === "transfer" &&
    template.destinationAccountId &&
    dataset.accounts.some(
      (a) =>
        a.id === template.destinationAccountId &&
        a.isActive &&
        a.isVisible &&
        a.id !== accountId,
    )
      ? template.destinationAccountId
      : undefined;
  const categoryId =
    template.categoryId &&
    dataset.categories.some((c) => c.id === template.categoryId)
      ? template.categoryId
      : undefined;
  const tagId =
    template.tagId &&
    dataset.tags.some((t) => t.id === template.tagId && t.isActive)
      ? template.tagId
      : undefined;
  if (missingAccount) problems.push("Choose an active account.");
  if (missingCard)
    problems.push(
      "The saved card is unavailable; choose a payment destination.",
    );
  if (missingAccount && template.creditCardId && !missingCard)
    problems.push(
      "Choose a payment destination explicitly, including card-only if appropriate.",
    );
  if (template.type === "transfer" && !destinationAccountId)
    problems.push("Choose a destination account.");
  if (template.type !== "transfer" && !categoryId)
    problems.push("Choose a category.");
  if (template.tagId && !tagId)
    problems.push(
      "The saved tag is unavailable and was removed from this draft.",
    );
  const card = dataset.creditCards.find((c) => c.id === creditCardId);
  const limitRate = card
    ? String(
        findExchangeRate(
          dataset.exchangeRates,
          template.currency,
          card.limitCurrency,
          now.toISOString(),
        ) ?? "",
      )
    : "1";
  const value: Omit<RecordTemplate, "id"> = {
    name: template.name,
    type: template.type,
    amount: template.amount,
    currency: template.currency,
    accountId,
    creditCardId,
    destinationAccountId,
    categoryId,
    tagId,
    counterpartyName: template.counterpartyName,
    note: template.note,
    paymentType:
      template.type === "transfer"
        ? "transfer"
        : creditCardId
          ? "credit"
          : template.paymentType === "credit"
            ? "debit"
            : template.paymentType,
  };
  return { value, limitRate, problems };
}

export function templateReplacementPatch(
  value: Omit<RecordTemplate, "id">,
): RecordTemplatePatch {
  return {
    name: value.name,
    type: value.type,
    amount: value.amount,
    currency: value.currency,
    paymentType: value.paymentType,
    accountId: value.accountId ?? null,
    creditCardId: value.creditCardId ?? null,
    destinationAccountId: value.destinationAccountId ?? null,
    categoryId: value.categoryId ?? null,
    tagId: value.tagId ?? null,
    counterpartyName: value.counterpartyName ?? null,
    note: value.note ?? null,
  };
}

export function sameTemplateDetails(
  a: Omit<RecordTemplate, "id">,
  b: Omit<RecordTemplate, "id">,
) {
  const signature = (value: Omit<RecordTemplate, "id">) =>
    JSON.stringify({
      ...templateReplacementPatch(value),
      name: value.name.trim().toLocaleLowerCase(),
    });
  return signature(a) === signature(b);
}
