import { currencySchema } from "@shared/schemas";
import { formatMoney } from "@shared/calculations";
import { paymentStatusLabels, paymentTypeLabels, recordTypeLabels } from "@shared/constants";
import { findExchangeRate } from "@shared/money";
import { Copy, Edit3, Plus, Save, Trash2, X } from "lucide-react";

import type { CurrencyCode, PaymentStatus, PaymentType, RecordType } from "@shared/types";
import type { useRecordForm } from "./use-record-form";

import {
  Input,
  DateTimeInput,
  controlClassName as fieldClassName,
  textareaClassName as noteFieldClassName,
} from "@/components/ui/form/controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryPicker } from "@/components/wallet/category-picker";
import { ImportHistory } from "@/components/wallet/record-import-history";
import { finishAction } from "@/lib/async-event";
import { formatCategoryName } from "@/lib/category-options";
import { dateTimeInputToIso } from "@/lib/date-input";
import { defaultRecordAccountId as defaultAccountId } from "@/lib/record-draft";
import { limitDecimalPlaces } from "@/lib/utils";

function dateTimeLocalToIso(value: string) {
  return value ? dateTimeInputToIso(value) : new Date().toISOString();
}
function typeButtonClassName(item: RecordType, currentType: RecordType) {
  if (item === currentType) {
    if (item === "expense") {
      return "rounded bg-red-500 px-2 py-2 text-sm font-medium text-white shadow-sm";
    }
    if (item === "income") {
      return "rounded bg-emerald-500 px-2 py-2 text-sm font-medium text-white shadow-sm";
    }
    return "rounded bg-sky-500 px-2 py-2 text-sm font-medium text-white shadow-sm";
  }

  if (item === "expense") {
    return "rounded px-2 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/10";
  }
  if (item === "income") {
    return "rounded px-2 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-500/10";
  }
  return "rounded px-2 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-500/10";
}
export function RecordFormDialog({ model }: { model: ReturnType<typeof useRecordForm> }) {
  const {
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
    currency,
    changeCurrency,
    primaryRate,
    setPrimaryRate,
    occurredAtLocal,
    accountAmount,
    destinationAccountId,
    destinationAmount,
    creditCardId,
    exchangeRateToLimitCurrency,
    setExchangeRateToLimitCurrency,
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
    changeAmount,
    changeAccountAmount,
    changeDestinationAmount,
    changeSourceAccount,
    changeDestinationAccount,
  } = model;
  return (
    <Dialog
      open={isRecordDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeRecordDialog();
        else setIsRecordDialogOpen(true);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editingId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Edit record" : "New record"}
          </DialogTitle>
          <DialogDescription>
            Adjust type, amount, account, category, goals, and payment status.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            finishAction(handleSubmit(event));
          }}
        >
          <fieldset disabled={model.toast?.status === "processing"} className="contents">
            {statusOnlyCancellation && (
              <p role="status" className="text-sm text-muted-foreground">
                Cancelling preserves the original record and excludes it from balances.
              </p>
            )}
            {templateNotice && (
              <p role="status" className="text-sm text-muted-foreground">
                {templateNotice}
              </p>
            )}
            {editingLinkedRefund && (
              <p className="text-sm text-muted-foreground">
                Bank-linked card refund amounts and payment details are managed in Cards. You can
                edit its category, counterparty, goals, tags and note here.
              </p>
            )}
            {moneyError && (
              <p role="alert" className="text-sm text-red-500">
                {moneyError}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary p-1">
              {(["expense", "income", "transfer"] as RecordType[]).map((item) => (
                <button
                  key={item}
                  disabled={Boolean(editingLinkedRefund)}
                  type="button"
                  onClick={() => {
                    setType(item);
                    setCategoryId("");
                    setPaymentType(item === "transfer" ? "transfer" : "debit");
                    setCreditCardId("");
                    if (item === "transfer") setGoalAssociations([]);
                    if (!accountId) setAccountId(defaultAccountId(dataset));
                  }}
                  className={typeButtonClassName(item, type)}
                >
                  {recordTypeLabels[item]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Amount</span>
                <Input
                  disabled={Boolean(editingLinkedRefund)}
                  value={amount}
                  onChange={changeAmount}
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                />
              </label>
              <div className="space-y-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Currency</span>
                  <select
                    disabled={Boolean(editingLinkedRefund)}
                    value={currency}
                    onChange={(event) => changeCurrency(event.target.value as CurrencyCode)}
                    className={fieldClassName}
                  >
                    {currencySchema.options.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <details className="rounded-md border bg-background p-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Exchange rate (optional)
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Uses the default rate unless you enter a custom rate.
                  </p>
                  <div className="mt-3 grid gap-3">
                    {
                      <label className="space-y-1 text-sm">
                        Exchange rate to {dataset.settings.primaryCurrency}
                        <Input
                          disabled={Boolean(editingLinkedRefund)}
                          value={primaryRate}
                          onChange={(event) => setPrimaryRate(event.target.value)}
                          placeholder={String(
                            findExchangeRate(
                              dataset.exchangeRates,
                              currency,
                              dataset.settings.primaryCurrency,
                              dateTimeLocalToIso(occurredAtLocal),
                            ) ?? "Enter exchange rate",
                          )}
                          className={fieldClassName}
                          inputMode="decimal"
                        />
                      </label>
                    }
                    {accountId &&
                      dataset.accounts.find((item) => item.id === accountId)?.currency !==
                        currency && (
                        <label className="space-y-1 text-sm">
                          Account amount (
                          {dataset.accounts.find((item) => item.id === accountId)?.currency}
                          )
                          <Input
                            disabled={Boolean(editingLinkedRefund)}
                            value={accountAmount}
                            onChange={changeAccountAmount}
                            className={fieldClassName}
                            inputMode="decimal"
                            placeholder="Calculated using the historical rate"
                          />
                        </label>
                      )}
                    {type === "transfer" && (
                      <label className="space-y-1 text-sm">
                        Received amount (
                        {
                          dataset.accounts.find((item) => item.id === destinationAccountId)
                            ?.currency
                        }
                        )
                        <Input
                          disabled={Boolean(editingLinkedRefund)}
                          value={destinationAmount}
                          onChange={changeDestinationAmount}
                          className={fieldClassName}
                          inputMode="decimal"
                          placeholder="Calculated using the historical rate"
                        />
                      </label>
                    )}
                    {creditCardId && (
                      <label className="space-y-1 text-sm">
                        Exchange rate to card limit currency
                        <Input
                          disabled={Boolean(editingLinkedRefund)}
                          value={exchangeRateToLimitCurrency}
                          onChange={(event) => setExchangeRateToLimitCurrency(event.target.value)}
                          className={fieldClassName}
                          inputMode="decimal"
                        />
                      </label>
                    )}
                  </div>
                </details>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  {type === "expense" && creditCardId
                    ? "Account (optional for card purchases)"
                    : "Account"}
                </span>
                <select
                  disabled={Boolean(editingLinkedRefund)}
                  value={accountId}
                  onChange={changeSourceAccount}
                  className={fieldClassName}
                >
                  {!(type === "expense" && creditCardId && editingRecord?.accountId) && (
                    <option value="">
                      {type === "expense" && creditCardId ? "Card only" : "Choose account"}
                    </option>
                  )}
                  {dataset.accounts
                    .filter((account) => account.isActive && account.isVisible)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
              {type === "transfer" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Destination account</span>
                  <select
                    disabled={Boolean(editingLinkedRefund)}
                    value={destinationAccountId}
                    onChange={changeDestinationAccount}
                    className={fieldClassName}
                  >
                    <option value="">Choose destination account</option>
                    {dataset.accounts
                      .filter(
                        (account) =>
                          account.isActive && account.isVisible && account.id !== accountId,
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Category</span>
                  <CategoryPicker
                    categories={categories}
                    value={categoryId}
                    onChange={setCategoryId}
                    inputClassName={fieldClassName}
                    getLabel={(category) => formatCategoryName(dataset.categories, category)}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Date and time</span>
                  <DateTimeInput
                    disabled={Boolean(editingLinkedRefund)}
                    value={occurredAtLocal}
                    onChange={(event) => setOccurredAtLocal(event.target.value)}
                    className={fieldClassName}
                  />
                </label>
              }
              <label className="block space-y-2">
                <span className="text-sm font-medium">Counterparty</span>
                <Input
                  value={counterpartyName}
                  onChange={(event) => setCounterpartyName(event.target.value)}
                  className={fieldClassName}
                  placeholder="Name"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Payment type</span>
                <select
                  disabled={Boolean(editingLinkedRefund)}
                  value={creditCardId ? `card:${creditCardId}` : paymentType}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith("card:")) {
                      const nextCardId = value.slice(5);
                      const card = dataset.creditCards.find((item) => item.id === nextCardId);
                      setCreditCardId(nextCardId);
                      setPaymentType("credit");
                      changeCurrency(card?.limitCurrency ?? "UYU");
                      setExchangeRateToLimitCurrency("1");
                      return;
                    }
                    setCreditCardId("");
                    setPaymentType(value as PaymentType);
                    const nextAccountId = accountId || defaultAccountId(dataset);
                    setAccountId(nextAccountId);
                    const account = dataset.accounts.find((item) => item.id === nextAccountId);
                    if (account) changeCurrency(account.currency);
                  }}
                  className={fieldClassName}
                >
                  <option value="cash">{paymentTypeLabels.cash}</option>
                  <option value="debit">{paymentTypeLabels.debit}</option>
                  {dataset.creditCards
                    .filter(
                      (card) =>
                        (type === "expense" && card.isActive) ||
                        (editingLinkedRefund && card.id === creditCardId),
                    )
                    .map((card) => (
                      <option key={card.id} value={`card:${card.id}`}>
                        Credit **** {card.lastFour} - {card.name}
                      </option>
                    ))}
                  <option value="transfer">{paymentTypeLabels.transfer}</option>
                  <option value="other">{paymentTypeLabels.other}</option>
                </select>
              </label>
              {type !== "transfer" ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Goals</span>
                  <div className="flex min-h-10 flex-wrap gap-2 rounded-md border bg-background p-2">
                    {dataset.goals
                      .filter(
                        (goal) =>
                          goal.status === "active" ||
                          goalAssociations.some((association) => association.goalId === goal.id),
                      )
                      .map((goal) => {
                        const association = goalAssociations.find(
                          (item) => item.goalId === goal.id,
                        );

                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() =>
                              setGoalAssociations((current) =>
                                association
                                  ? current.filter((item) => item.goalId !== goal.id)
                                  : [
                                      ...current,
                                      {
                                        goalId: goal.id,
                                        assignmentSource: "manual",
                                        useReserved: !editingId,
                                        reserveIncome: true,
                                      },
                                    ],
                              )
                            }
                            className={
                              association
                                ? "rounded-md border px-2 py-1 text-xs font-medium text-white"
                                : "rounded-md border px-2 py-1 text-xs text-muted-foreground"
                            }
                            style={
                              association
                                ? {
                                    backgroundColor: goal.color,
                                    borderColor: goal.color,
                                  }
                                : undefined
                            }
                          >
                            {goal.name}
                            {association?.assignmentSource === "date_rule" ? " · automatic" : ""}
                          </button>
                        );
                      })}
                    {dataset.goals.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No active goals</span>
                    ) : null}
                  </div>
                  {goalAssociations.map((association) => {
                    const goal = dataset.goals.find((item) => item.id === association.goalId);
                    if (!goal) return null;
                    const key = type === "income" ? "reserveIncome" : "useReserved";

                    return (
                      <div key={goal.id} className="space-y-2 rounded-md border p-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={association[key]}
                            onChange={(event) =>
                              updateGoalAssociation(goal.id, {
                                [key]: event.target.checked,
                              })
                            }
                          />
                          {type === "income" ? "Reserve this income again" : "Use reserved funds"} ·{" "}
                          {goal.name}
                        </label>
                        <label className="block space-y-1 text-xs text-muted-foreground">
                          <span>Amount for this goal</span>
                          <Input
                            value={association.allocatedAmount ?? ""}
                            onChange={(event) => {
                              const value = limitDecimalPlaces(event.target.value);
                              updateGoalAssociation(goal.id, {
                                allocatedAmount: value ? Number(value) : undefined,
                              });
                            }}
                            className={fieldClassName}
                            type="number"
                            min="0"
                            max={amount || undefined}
                            step="0.01"
                            placeholder={
                              amount
                                ? `Entire record (${formatMoney(numericAmount, currency)})`
                                : "Entire record"
                            }
                          />
                          {association.allocatedAmount !== undefined &&
                          association.allocatedAmount > numericAmount ? (
                            <span className="text-red-600">Cannot exceed the record amount.</span>
                          ) : null}
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div />
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Status</legend>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-secondary p-1 sm:grid-cols-4">
                {(["cleared", "pending", "needs_review", "cancelled"] as PaymentStatus[]).map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      aria-label={`Set status to ${paymentStatusLabels[item]}`}
                      aria-pressed={paymentStatus === item}
                      disabled={Boolean(editingLinkedRefund)}
                      onClick={() => setPaymentStatus(item)}
                      className={
                        paymentStatus === item
                          ? "rounded-md bg-background px-2 py-2 text-sm font-medium shadow-sm"
                          : "rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-background/60"
                      }
                    >
                      {paymentStatusLabels[item]}
                    </button>
                  ),
                )}
              </div>
            </fieldset>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Notes</span>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={noteFieldClassName}
                placeholder="Optional description"
              />
            </label>
            {editingRecord && <ImportHistory record={editingRecord} />}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {editingId ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(editingLinkedRefund)}
                    onClick={() => {
                      finishAction(handleDeleteEditingRecord());
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Duplicate record"
                    onClick={duplicateEditingRecord}
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={closeRecordDialog}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!canSubmit}>
                {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? "Save changes" : "Add"}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
