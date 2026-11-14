import { findExchangeRate } from "@shared/money";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useRecordDraft } from "./use-record-draft";

import type { ChangeEvent } from "react";
import type { CurrencyCode, RecordGoalAssociation, RecordType, WalletRecord } from "@shared/types";

import { limitDecimalPlaces } from "@/lib/utils";
import { scaleDraftAmount } from "@/lib/record-draft";
import { sortCategoriesForSelect } from "@/lib/category-options";
import { localDateTimeInput as toDateTimeLocal } from "@/lib/date-input";
import {
  buildRecordInput,
  buildRecordPatch,
  defaultRecordAccountId as defaultAccountId,
  defaultRecordDestinationId as defaultDestinationAccountId,
  draftFromRecord,
  draftFromTemplate,
  hasInvalidGoalAllocation as draftHasInvalidGoalAllocation,
  duplicateDraft,
  emptyDraft,
  recordSubmitMode,
} from "@/lib/record-draft";
import { useActionToast } from "@/lib/use-action-toast";
import { useWallet } from "@/providers/wallet-provider";

export function useRecordForm() {
  const openedNewRecordRef = useRef(0);
  const {
    dataset,
    recordFilters,
    updateRecord,
    addRecord,
    deleteRecord,
    newRecordRequestId,
    newRecordTemplateId,
    consumeNewRecordRequest,
  } = useWallet();
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState("");
  const recordDraftRevision = useRef(0);
  const {
    draft,
    setDraft,
    type,
    setType,
    accountId,
    setAccountId,
    creditCardId,
    setCreditCardId,
    currency,
    setCurrency,
    exchangeRateToLimitCurrency,
    setExchangeRateToLimitCurrency,
    destinationAccountId,
    setDestinationAccountId,
    categoryId,
    setCategoryId,
    amount,
    accountAmount,
    setAccountAmount,
    destinationAmount,
    setDestinationAmount,
    primaryRate,
    setPrimaryRate,
    moneyError,
    setMoneyError,
    note,
    setNote,
    goalAssociations,
    setGoalAssociations,
    counterpartyName,
    setCounterpartyName,
    occurredAtLocal,
    setOccurredAtLocal,
    paymentType,
    setPaymentType,
    paymentStatus,
    setPaymentStatus,
  } = useRecordDraft(() => ({
    type: "expense",
    accountId: defaultAccountId(dataset),
    creditCardId: recordFilters.creditCardId ?? "",
    currency: "UYU",
    exchangeRateToLimitCurrency: "1",
    destinationAccountId: defaultDestinationAccountId(dataset, defaultAccountId(dataset)),
    categoryId: "",
    amount: "",
    accountAmount: "",
    destinationAmount: "",
    primaryRate: "",
    moneyError: "",
    note: "",
    tagId: "",
    goalAssociations: [],
    counterpartyName: "",
    occurredAtLocal: toDateTimeLocal(new Date()),
    paymentType: "debit",
    paymentStatus: "cleared",
  }));
  const conversionBasis = useRef<{
    source?: { amount: string; converted: string };
    destination?: { amount: string; converted: string };
  }>({});
  const recordSubmission = useRef(false);
  const { toast, runAction } = useActionToast();
  const categories = useMemo(
    () => sortCategoriesForSelect(dataset.categories),
    [dataset.categories],
  );
  const numericAmount = Number(amount);
  const hasInvalidGoalAllocation = draftHasInvalidGoalAllocation(draft);
  const editingLinkedRefund = dataset.creditCardRecords.find(
    (record) => record.walletRecordId === editingId && record.kind === "refund",
  );
  const editingRecord = dataset.records.find((record) => record.id === editingId);
  const submitMode = recordSubmitMode(draft, editingRecord, Boolean(editingLinkedRefund));
  const statusOnlyCancellation = submitMode === "cancel";
  const reviewMetadataOnly = submitMode === "review";
  const canSubmit =
    statusOnlyCancellation ||
    (reviewMetadataOnly && !hasInvalidGoalAllocation) ||
    (numericAmount > 0 &&
      Boolean(accountId || (type === "expense" && creditCardId)) &&
      (type === "transfer" ? Boolean(destinationAccountId) : Boolean(categoryId)) &&
      !hasInvalidGoalAllocation);
  function updateGoalAssociation(goalId: string, patch: Partial<RecordGoalAssociation>) {
    setGoalAssociations((current) =>
      current.map((association) =>
        association.goalId === goalId ? { ...association, ...patch } : association,
      ),
    );
  }
  useEffect(() => {
    if (!newRecordRequestId || openedNewRecordRef.current === newRecordRequestId) return;
    queueMicrotask(() => {
      recordDraftRevision.current += 1;
      openedNewRecordRef.current = newRecordRequestId;
      const now = new Date();
      const requested = dataset.creditCards.find(
        (card) => card.id === recordFilters.creditCardId && card.isActive,
      );
      let next = emptyDraft(dataset, now);
      if (requested)
        next = {
          ...next,
          creditCardId: requested.id,
          currency: requested.limitCurrency,
          paymentType: "credit",
        };
      next = { ...next, goalAssociations: [] };
      let notice = "";
      if (newRecordTemplateId) {
        const template = dataset.recordTemplates?.find((item) => item.id === newRecordTemplateId);
        if (template) {
          const prepared = draftFromTemplate(template, dataset, now, next);
          next = prepared.draft;
          notice = prepared.notice;
        } else notice = "The template is no longer available. Complete a new record.";
      }
      setEditingId(null);
      setTemplateNotice(notice);
      setDraft(next);
      conversionBasis.current = {};
      setIsRecordDialogOpen(true);
      consumeNewRecordRequest();
    });
  }, [
    consumeNewRecordRequest,
    dataset,
    newRecordRequestId,
    newRecordTemplateId,
    recordFilters.creditCardId,
    setDraft,
  ]);
  function resetForm(nextType: RecordType = "expense") {
    recordDraftRevision.current += 1;
    conversionBasis.current = {};
    setTemplateNotice("");
    setEditingId(null);
    setDraft(emptyDraft(dataset, new Date(), nextType));
  }
  function openNewRecordDialog() {
    resetForm();
    setIsRecordDialogOpen(true);
  }
  function loadRecord(record: WalletRecord) {
    recordDraftRevision.current += 1;
    setTemplateNotice("");
    setEditingId(record.id);
    setDraft(draftFromRecord(record));
    conversionBasis.current = {
      source:
        record.accountAmount === undefined
          ? undefined
          : { amount: String(record.amount), converted: String(record.accountAmount) },
      destination:
        record.destinationAmount === undefined
          ? undefined
          : { amount: String(record.amount), converted: String(record.destinationAmount) },
    };
    setIsRecordDialogOpen(true);
  }
  function duplicateEditingRecord() {
    const record = dataset.records.find((item) => item.id === editingId);
    if (!record) return;
    resetForm(record.type);
    setDraft(duplicateDraft(record, dataset, new Date()));
  }
  function closeRecordDialog() {
    setIsRecordDialogOpen(false);
    openedNewRecordRef.current = 0;
    resetForm(type);
  }
  function changeCurrency(next: CurrencyCode) {
    if (next === currency) return;
    setCurrency(next);
    conversionBasis.current = {};
    setPrimaryRate("");
    setAccountAmount("");
    setDestinationAmount("");
    const card = dataset.creditCards.find((item) => item.id === creditCardId);
    setExchangeRateToLimitCurrency(
      card ? String(findExchangeRate(dataset.exchangeRates, next, card.limitCurrency) ?? "") : "1",
    );
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (recordSubmission.current) return;
    if (creditCardId && type !== "expense" && !editingLinkedRefund && !statusOnlyCancellation) {
      setMoneyError(
        "Use Cards to refund a purchase. Income and transfers cannot select a credit card.",
      );
      return;
    }
    const now = new Date();
    const patch = editingId
      ? buildRecordPatch(draft, editingRecord, dataset, now, {
          linkedRefund: Boolean(editingLinkedRefund),
        })
      : null;
    const created = editingId ? null : buildRecordInput(draft, dataset, undefined, now);
    const result = patch ?? created;
    if (!result || !result.ok) {
      if (result?.error) setMoneyError(result.error);
      return;
    }
    recordSubmission.current = true;
    const revision = recordDraftRevision.current;
    try {
      if (editingId && patch?.ok)
        await runAction(() => updateRecord(editingId, patch.patch), {
          processing: "Saving record...",
          success: "Record saved",
          error: "Could not save record",
        });
      else if (created?.ok)
        await runAction(() => addRecord(created.value), {
          processing: "Creating record...",
          success: "Record created",
          error: "Could not create record",
        });
    } catch {
      return;
    } finally {
      recordSubmission.current = false;
    }
    if (revision === recordDraftRevision.current) closeRecordDialog();
  }
  async function handleDeleteEditingRecord() {
    if (!editingId) return;
    try {
      await runAction(() => deleteRecord(editingId), {
        processing: "Deleting record...",
        success: "Record deleted",
        error: "Could not delete record",
      });
    } catch {
      return;
    }

    closeRecordDialog();
  }
  const changeAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const next = limitDecimalPlaces(event.target.value);
    const basis = { ...conversionBasis.current };
    setDraft((current) => scaleDraftAmount(current, next, basis));
  };
  const changeAccountAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const next = limitDecimalPlaces(event.target.value);
    setAccountAmount(next);
    conversionBasis.current.source =
      Number(amount) > 0 && Number(next) > 0 ? { amount, converted: next } : undefined;
  };
  const changeDestinationAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const next = limitDecimalPlaces(event.target.value);
    setDestinationAmount(next);
    conversionBasis.current.destination =
      Number(amount) > 0 && Number(next) > 0 ? { amount, converted: next } : undefined;
  };
  const changeSourceAccount = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    setAccountId(nextId);
    setAccountAmount("");
    conversionBasis.current.source = undefined;
    if (!editingId && !creditCardId) {
      const next = dataset.accounts.find((item) => item.id === nextId);
      if (next) changeCurrency(next.currency);
      setPrimaryRate("");
    }
  };
  const changeDestinationAccount = (event: ChangeEvent<HTMLSelectElement>) => {
    setDestinationAccountId(event.target.value);
    setDestinationAmount("");
    conversionBasis.current.destination = undefined;
  };
  return {
    isRecordDialogOpen,
    closeRecordDialog,
    setIsRecordDialogOpen,
    editingId,
    handleSubmit,
    statusOnlyCancellation,
    templateNotice,
    editingLinkedRefund,
    moneyError,
    setType,
    setCategoryId,
    setPaymentType,
    setCreditCardId,
    setGoalAssociations,
    accountId,
    setAccountId,
    dataset,
    type,
    amount,
    setDraft,
    currency,
    changeCurrency,
    primaryRate,
    setPrimaryRate,
    occurredAtLocal,
    accountAmount,
    setAccountAmount,
    destinationAccountId,
    destinationAmount,
    setDestinationAmount,
    creditCardId,
    exchangeRateToLimitCurrency,
    setExchangeRateToLimitCurrency,
    setDestinationAccountId,
    categories,
    categoryId,
    setOccurredAtLocal,
    counterpartyName,
    setCounterpartyName,
    paymentType,
    goalAssociations,
    updateGoalAssociation,
    numericAmount,
    paymentStatus,
    setPaymentStatus,
    note,
    setNote,
    editingRecord,
    handleDeleteEditingRecord,
    duplicateEditingRecord,
    canSubmit,
    loadRecord,
    openNewRecordDialog,
    toast,
    runAction,
    changeAmount,
    changeAccountAmount,
    changeDestinationAmount,
    changeSourceAccount,
    changeDestinationAccount,
  };
}
