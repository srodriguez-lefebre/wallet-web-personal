import { categoryMatchesKind, selectableCategory } from "@shared/categories";
import { findExchangeRate } from "@shared/money";
import { splitImportNote } from "@shared/record-review";

import { localDateTimeInput, dateTimeInputToIso } from "./date-input";
import { recordAccountAmount, scaleConvertedAmount } from "./record-form-money";
import { prepareTemplateDraft } from "./record-templates";

import type {
  CurrencyCode,
  PaymentStatus,
  PaymentType,
  RecordGoalAssociation,
  RecordType,
  RecordTemplate,
  WalletDataset,
  WalletRecord,
} from "@shared/types";
import type { RecordPatch } from "@shared/schemas";

export interface RecordDraft {
  type: RecordType;
  accountId: string;
  creditCardId: string;
  currency: CurrencyCode;
  exchangeRateToLimitCurrency: string;
  destinationAccountId: string;
  categoryId: string;
  amount: string;
  accountAmount: string;
  destinationAmount: string;
  primaryRate: string;
  moneyError: string;
  note: string;
  tagId: string;
  goalAssociations: RecordGoalAssociation[];
  counterpartyName: string;
  occurredAtLocal: string;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
}
export interface ConversionBasis {
  source?: { amount: string; converted: string };
  destination?: { amount: string; converted: string };
}
export function defaultRecordAccountId(dataset: WalletDataset) {
  const visible = dataset.accounts.filter((account) => account.isActive && account.isVisible);
  return (
    visible.find(
      (account) =>
        account.id === (dataset.settings.defaultAccountId ?? dataset.settings.primaryAccountId),
    )?.id ??
    visible[0]?.id ??
    dataset.accounts.find((account) => account.isActive)?.id ??
    ""
  );
}
export function defaultRecordDestinationId(dataset: WalletDataset, source: string) {
  return (
    dataset.accounts.find(
      (account) => account.isActive && account.isVisible && account.id !== source,
    )?.id ?? ""
  );
}
export function recordGoalAssociations(record: WalletRecord): RecordGoalAssociation[] {
  return (
    record.goalAssociations ??
    (record.goalIds ?? []).map((goalId) => ({
      goalId,
      assignmentSource: "manual" as const,
      useReserved: true,
      reserveIncome: true,
    }))
  ).map((item) => ({ ...item }));
}
export function emptyDraft(
  dataset: WalletDataset,
  now: Date,
  type: RecordType = "expense",
): RecordDraft {
  const accountId = defaultRecordAccountId(dataset);
  const card =
    type === "expense"
      ? dataset.creditCards.find(
          (item) =>
            dataset.settings.defaultPaymentType === "credit" &&
            item.id === dataset.settings.defaultCreditCardId &&
            item.isActive,
        )
      : undefined;
  const date = now.toISOString().slice(0, 10);
  return {
    type,
    accountId,
    creditCardId: card?.id ?? "",
    currency:
      card?.limitCurrency ??
      dataset.accounts.find((account) => account.id === accountId)?.currency ??
      "UYU",
    exchangeRateToLimitCurrency: "1",
    destinationAccountId: defaultRecordDestinationId(dataset, accountId),
    categoryId: "",
    amount: "",
    accountAmount: "",
    destinationAmount: "",
    primaryRate: "",
    moneyError: "",
    note: "",
    tagId: "",
    goalAssociations: dataset.goals
      .filter(
        (goal) =>
          goal.status === "active" &&
          goal.autoCaptureEnabled &&
          goal.autoCaptureStart &&
          goal.autoCaptureEnd &&
          goal.autoCaptureStart <= date &&
          goal.autoCaptureEnd >= date,
      )
      .map((goal) => ({
        goalId: goal.id,
        assignmentSource: "date_rule",
        useReserved: true,
        reserveIncome: true,
      })),
    counterpartyName: "",
    occurredAtLocal: localDateTimeInput(now),
    paymentType:
      type === "transfer" ? "transfer" : card ? "credit" : dataset.settings.defaultPaymentType,
    paymentStatus: dataset.settings.defaultPaymentStatus,
  };
}
export function draftFromRecord(record: WalletRecord): RecordDraft {
  return {
    type: record.type,
    accountId: record.accountId ?? "",
    creditCardId: record.creditCardId ?? "",
    currency: record.currency,
    exchangeRateToLimitCurrency: String(record.exchangeRateToLimitCurrency ?? 1),
    destinationAccountId: record.destinationAccountId ?? "",
    categoryId: record.categoryId ?? "",
    amount: String(record.amount),
    accountAmount: String(record.accountAmount ?? record.amount),
    destinationAmount:
      record.destinationAmount === undefined ? "" : String(record.destinationAmount),
    primaryRate: String(record.exchangeRateToPrimary),
    moneyError: "",
    note: splitImportNote(record.note).note ?? "",
    tagId: record.tagIds[0] ?? "",
    goalAssociations: recordGoalAssociations(record),
    counterpartyName: record.counterpartyName ?? "",
    occurredAtLocal: localDateTimeInput(record.occurredAt),
    paymentType: record.paymentType,
    paymentStatus: record.paymentStatus,
  };
}
export function duplicateDraft(
  record: WalletRecord,
  dataset: WalletDataset,
  now: Date,
): RecordDraft {
  const draft = emptyDraft(dataset, now, record.type);
  const account = dataset.accounts.find((item) => item.id === record.accountId && item.isActive);
  const card =
    record.type === "expense"
      ? dataset.creditCards.find((item) => item.id === record.creditCardId && item.isActive)
      : undefined;
  const destination = dataset.accounts.find(
    (item) => item.id === record.destinationAccountId && item.isActive && item.id !== account?.id,
  );
  return {
    ...draft,
    accountId: account?.id ?? "",
    creditCardId: card?.id ?? "",
    destinationAccountId: record.type === "transfer" ? (destination?.id ?? "") : "",
    currency: record.currency,
    amount: String(record.amount),
    categoryId:
      record.type === "transfer"
        ? ""
        : (dataset.categories.find(
            (item) =>
              item.id === record.categoryId &&
              selectableCategory(item) &&
              categoryMatchesKind(item, record.type === "transfer" ? undefined : record.type),
          )?.id ?? ""),
    counterpartyName: record.counterpartyName ?? "",
    note: record.note ?? "",
    tagId: record.tagIds[0] ?? "",
    paymentType:
      record.type === "transfer"
        ? "transfer"
        : card
          ? "credit"
          : record.paymentType === "credit"
            ? "debit"
            : record.paymentType,
    exchangeRateToLimitCurrency: card
      ? String(
          findExchangeRate(
            dataset.exchangeRates,
            record.currency,
            card.limitCurrency,
            now.toISOString(),
          ) ?? "",
        )
      : "1",
  };
}
export function scaleDraftAmount(
  draft: RecordDraft,
  amount: string,
  basis: ConversionBasis,
): RecordDraft {
  return {
    ...draft,
    amount,
    accountAmount: basis.source
      ? scaleConvertedAmount(basis.source.converted, basis.source.amount, amount)
      : draft.accountAmount,
    destinationAmount: basis.destination
      ? scaleConvertedAmount(basis.destination.converted, basis.destination.amount, amount)
      : draft.destinationAmount,
  };
}
export function hasInvalidGoalAllocation(draft: RecordDraft) {
  return draft.goalAssociations.some(
    (item) =>
      item.allocatedAmount !== undefined &&
      (!Number.isFinite(item.allocatedAmount) ||
        item.allocatedAmount <= 0 ||
        item.allocatedAmount > Number(draft.amount)),
  );
}
export function recordSubmitMode(
  draft: RecordDraft,
  original: WalletRecord | undefined,
  linkedRefund = false,
): "cancel" | "review" | "refund" | "full" {
  if (
    original &&
    !linkedRefund &&
    draft.paymentStatus === "cancelled" &&
    original.paymentStatus === "needs_review"
  )
    return "cancel";
  if (
    original &&
    original.exchangeRateToPrimary === 0 &&
    original.paymentStatus === "needs_review" &&
    draft.paymentStatus === "needs_review" &&
    draft.primaryRate.trim() !== "" &&
    Number(draft.primaryRate) === 0 &&
    draft.type === original.type &&
    Number(draft.amount) === original.amount &&
    draft.currency === original.currency &&
    (draft.accountId || undefined) === original.accountId &&
    (!draft.accountId ||
      Number(draft.accountAmount) === (original.accountAmount ?? original.amount)) &&
    (draft.destinationAccountId || undefined) === original.destinationAccountId &&
    draft.destinationAmount === String(original.destinationAmount ?? "") &&
    (draft.creditCardId || undefined) === original.creditCardId &&
    Number(draft.exchangeRateToLimitCurrency) === (original.exchangeRateToLimitCurrency ?? 1) &&
    draft.paymentType === original.paymentType &&
    draft.occurredAtLocal === localDateTimeInput(original.occurredAt) &&
    JSON.stringify(draft.goalAssociations) === JSON.stringify(recordGoalAssociations(original))
  )
    return "review";
  return linkedRefund ? "refund" : "full";
}
type InvalidDraft = { ok: false; error?: string };
type RecordInputResult = { ok: true; value: Omit<WalletRecord, "id"> } | InvalidDraft;
export function buildRecordInput(
  draft: RecordDraft,
  dataset: WalletDataset,
  original: WalletRecord | undefined,
  now: Date,
): RecordInputResult {
  const amount = Number(draft.amount);
  if (!amount || amount <= 0 || hasInvalidGoalAllocation(draft)) return { ok: false };
  const account = dataset.accounts.find((item) => item.id === draft.accountId);
  const card = dataset.creditCards.find((item) => item.id === draft.creditCardId);
  const destination = dataset.accounts.find((item) => item.id === draft.destinationAccountId);
  const limitRate = Number(draft.exchangeRateToLimitCurrency);
  const date =
    original && localDateTimeInput(original.occurredAt) === draft.occurredAtLocal
      ? original.occurredAt
      : draft.occurredAtLocal
        ? dateTimeInputToIso(draft.occurredAtLocal)
        : now.toISOString();
  const primaryRate =
    Number(draft.primaryRate) ||
    findExchangeRate(dataset.exchangeRates, draft.currency, dataset.settings.primaryCurrency, date);
  const sourceRate = account
    ? findExchangeRate(dataset.exchangeRates, draft.currency, account.currency, date)
    : 1;
  const targetRate = destination
    ? findExchangeRate(dataset.exchangeRates, draft.currency, destination.currency, date)
    : 1;
  const unchanged = original?.amount === amount && original.currency === draft.currency;
  const sourceAmount = account
    ? recordAccountAmount(
        amount,
        draft.currency,
        account.currency,
        draft.accountAmount,
        sourceRate,
        unchanged && original?.accountId === draft.accountId,
      )
    : undefined;
  const targetAmount =
    draft.type === "transfer" && destination
      ? recordAccountAmount(
          amount,
          draft.currency,
          destination.currency,
          draft.destinationAmount,
          targetRate,
          unchanged && original?.destinationAccountId === draft.destinationAccountId,
        )
      : undefined;
  if (
    primaryRate === null ||
    !Number.isFinite(primaryRate) ||
    primaryRate <= 0 ||
    sourceAmount === null ||
    targetAmount === null ||
    (card && (!Number.isFinite(limitRate) || limitRate <= 0))
  )
    return {
      ok: false,
      error: "Enter the converted amounts and a valid exchange rate for the selected currencies.",
    };
  return {
    ok: true,
    value: {
      type: draft.type,
      amount,
      currency: draft.currency,
      accountId: draft.accountId || undefined,
      accountAmount: sourceAmount,
      creditCardId: draft.creditCardId || undefined,
      destinationAccountId: draft.type === "transfer" ? draft.destinationAccountId : undefined,
      destinationAmount: targetAmount,
      categoryId: draft.type === "transfer" ? undefined : draft.categoryId,
      counterpartyName: draft.counterpartyName.trim() || undefined,
      tagIds: draft.tagId ? [draft.tagId] : [],
      goalIds: draft.goalAssociations.map((item) => item.goalId),
      goalAssociations: draft.goalAssociations,
      paymentType: draft.paymentType,
      paymentStatus: draft.paymentStatus,
      exchangeRateToPrimary: primaryRate,
      amountInLimitCurrency: card
        ? unchanged &&
          original?.creditCardId === draft.creditCardId &&
          original.exchangeRateToLimitCurrency === limitRate
          ? original.amountInLimitCurrency
          : amount * limitRate
        : undefined,
      exchangeRateToLimitCurrency: card ? limitRate : undefined,
      occurredAt: date,
      note: draft.note || undefined,
    },
  };
}
export function buildRecordPatch(
  draft: RecordDraft,
  original: WalletRecord | undefined,
  dataset: WalletDataset,
  now: Date,
  options: { linkedRefund?: boolean } = {},
): { ok: true; mode: ReturnType<typeof recordSubmitMode>; patch: RecordPatch } | InvalidDraft {
  const mode = recordSubmitMode(draft, original, options.linkedRefund);
  if (mode === "cancel") return { ok: true, mode, patch: { paymentStatus: "cancelled" } };
  if (hasInvalidGoalAllocation(draft)) return { ok: false };
  const metadata = {
    categoryId: draft.categoryId || null,
    counterpartyName: draft.counterpartyName.trim() || null,
    note: draft.note || null,
    tagIds: draft.tagId ? [draft.tagId] : [],
  };
  if (mode === "review") return { ok: true, mode, patch: metadata };
  if (mode === "refund")
    return {
      ok: true,
      mode,
      patch: {
        ...metadata,
        categoryId: draft.categoryId,
        goalIds: draft.goalAssociations.map((item) => item.goalId),
        goalAssociations: draft.goalAssociations,
      },
    };
  const input = buildRecordInput(draft, dataset, original, now);
  return input.ok
    ? { ok: true, mode, patch: { ...input.value, creditCardId: draft.creditCardId || null } }
    : input;
}

export function draftFromTemplate(
  template: RecordTemplate,
  dataset: WalletDataset,
  now: Date,
  base: RecordDraft = emptyDraft(dataset, now),
) {
  const { value, limitRate, problems } = prepareTemplateDraft(template, dataset, now);
  return {
    draft: {
      ...base,
      type: value.type,
      amount: String(value.amount),
      currency: value.currency,
      accountId: value.accountId ?? "",
      creditCardId: value.creditCardId ?? "",
      destinationAccountId: value.destinationAccountId ?? "",
      categoryId: value.categoryId ?? "",
      tagId: value.tagId ?? "",
      counterpartyName: value.counterpartyName ?? "",
      note: value.note ?? "",
      paymentType: value.paymentType,
      exchangeRateToLimitCurrency: limitRate,
    },
    notice: problems.length
      ? problems.join(" ")
      : "Draft from template. Check the date and conversions before saving.",
  };
}
