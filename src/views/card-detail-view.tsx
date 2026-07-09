import { type FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { CategoryPicker } from "@/components/wallet/category-picker";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useActionToast } from "@/lib/use-action-toast";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateCreditCardStatementBalance,
  calculateCreditCardSummary,
  formatMoney,
} from "@shared/calculations";
import type { Category, CreditCardRecord, CurrencyCode } from "@shared/types";

const field =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const currencies: CurrencyCode[] = ["UYU", "USD", "EUR", "BRL", "ARS"];

function formatCategoryName(categories: Category[], category: Category) {
  const parent = category.parentId
    ? categories.find((candidate) => candidate.id === category.parentId)
    : undefined;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

export function CardDetailView() {
  const { cardId = "" } = useParams();
  const navigate = useNavigate();
  const {
    dataset,
    addCreditCardRecord,
    updateCreditCardRecord,
    addCreditCardRefund,
    deleteCreditCardRecord,
    payCreditCardStatement,
    deleteCreditCardPayment,
  } = useWallet();
  const card = dataset.creditCards.find((item) => item.id === cardId);
  const summary = useMemo(
    () => (card ? calculateCreditCardSummary(dataset, card) : null),
    [card, dataset],
  );
  const movements = dataset.creditCardRecords.filter(
    (item) => item.creditCardId === cardId,
  );
  const statements = dataset.creditCardStatements.filter(
    (item) => item.creditCardId === cardId,
  );
  const payments = dataset.creditCardPayments.filter(
    (item) => item.creditCardId === cardId,
  );
  const payableStatement = statements.find((item) => item.status !== "paid");
  const payableStatementBalance = useMemo(
    () =>
      payableStatement
        ? calculateCreditCardStatementBalance(dataset, payableStatement)
        : null,
    [dataset, payableStatement],
  );
  const [showMovement, setShowMovement] = useState(false);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(
    null,
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    card?.limitCurrency ?? "UYU",
  );
  const [rate, setRate] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [impactAccount, setImpactAccount] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [accountAmount, setAccountAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentAccountAmount, setPaymentAccountAmount] = useState("");
  const { toast, runAction } = useActionToast();

  if (!card || !summary) {
    return (
      <Card>
        <CardContent className="py-12 text-center">Card not found.</CardContent>
      </Card>
    );
  }

  function resetMovement() {
    setEditingMovementId(null);
    setAmount("");
    setCurrency(card!.limitCurrency);
    setRate("1");
    setCategoryId("");
    setCounterparty("");
    setNote("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setImpactAccount(false);
    setAccountId("");
    setAccountAmount("");
  }

  function openNewMovement() {
    resetMovement();
    setShowMovement(true);
  }

  function openEditMovement(movement: CreditCardRecord) {
    setEditingMovementId(movement.id);
    setAmount(String(movement.amount));
    setCurrency(movement.currency);
    setRate(String(movement.exchangeRateToLimitCurrency));
    setCategoryId(movement.categoryId);
    setCounterparty(movement.counterpartyName ?? "");
    setNote(movement.note ?? "");
    setDate(movement.occurredAt.slice(0, 10));
    setImpactAccount(movement.accountImpactAtCreation);
    setAccountId(movement.accountId ?? "");
    setAccountAmount(
      movement.accountAmount === undefined
        ? ""
        : String(movement.accountAmount),
    );
    setShowMovement(true);
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    const rateValue = Number(rate);
    if (
      value <= 0 ||
      rateValue <= 0 ||
      !categoryId ||
      (impactAccount && (!accountId || Number(accountAmount) <= 0))
    )
      return;
    const original = editingMovementId
      ? movements.find((item) => item.id === editingMovementId)
      : undefined;
    const payload = {
      kind: original?.kind ?? ("purchase" as const),
      originalRecordId: original?.originalRecordId,
      amount: value,
      currency,
      amountInLimitCurrency: value * rateValue,
      exchangeRateToLimitCurrency: rateValue,
      categoryId,
      counterpartyName: counterparty || undefined,
      note: note || undefined,
      accountId: impactAccount ? accountId : undefined,
      accountAmount: impactAccount ? Number(accountAmount) : undefined,
      accountImpactAtCreation: impactAccount,
      occurredAt: new Date(`${date}T12:00:00`).toISOString(),
    };
    await runAction(
      () =>
        editingMovementId
          ? updateCreditCardRecord(cardId, editingMovementId, payload)
          : addCreditCardRecord(cardId, payload),
      {
        processing: "Saving movement...",
        success: "Movement saved",
        error: "Could not save movement",
      },
    );
    resetMovement();
    setShowMovement(false);
  }

  async function refund(movementId: string) {
    const original = movements.find((item) => item.id === movementId);
    if (!original) return;
    await runAction(
      () =>
        addCreditCardRefund(cardId, {
          kind: "refund",
          originalRecordId: original.id,
          amount: original.amount,
          currency: original.currency,
          amountInLimitCurrency: original.amountInLimitCurrency,
          exchangeRateToLimitCurrency: original.exchangeRateToLimitCurrency,
          categoryId: original.categoryId,
          counterpartyName: original.counterpartyName,
          note: `Refund: ${original.note ?? original.counterpartyName ?? "movement"}`,
          accountId: original.accountId,
          accountAmount: original.accountAmount,
          accountImpactAtCreation: original.accountImpactAtCreation,
          occurredAt: new Date().toISOString(),
        }),
      {
        processing: "Saving refund...",
        success: "Refund saved",
        error: "Could not save refund",
      },
    );
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!payableStatement || Number(paymentAmount) <= 0) return;
    await runAction(
      () =>
        payCreditCardStatement(cardId, payableStatement.id, {
          amount: Number(paymentAmount),
          currency: card!.limitCurrency,
          amountInLimitCurrency: Number(paymentAmount),
          accountId: paymentAccountId || undefined,
          accountAmount: paymentAccountId
            ? Number(paymentAccountAmount)
            : undefined,
          occurredAt: new Date().toISOString(),
        }),
      {
        processing: "Paying statement...",
        success: "Payment saved",
        error: "Could not save payment",
      },
    );
    setPaymentAmount("");
    setPaymentAccountAmount("");
  }

  function fillFullPaymentAmount() {
    if (!payableStatementBalance) return;
    const amount = Number(
      payableStatementBalance.dueAmountInLimitCurrency.toFixed(2),
    );
    const value = String(amount);
    setPaymentAmount(value);
    const account = dataset.accounts.find((item) => item.id === paymentAccountId);
    if (account?.currency === card!.limitCurrency) {
      setPaymentAccountAmount(value);
    }
  }

  return (
    <div className="space-y-6">
      <ActionToast toast={toast} />
      <Button variant="ghost" onClick={() => navigate("/cards")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Cards
      </Button>
      <PageHeader
        title={`${card.name} •••• ${card.lastFour}`}
        description={`${card.issuer} · closes day ${card.closingDay} · due day ${card.dueDay}`}
      >
        <Button onClick={openNewMovement}>
          <Plus className="mr-2 h-4 w-4" /> Add movement
        </Button>
      </PageHeader>

      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingMovementId
                ? "Edit card movement"
                : "New card-only movement"}
            </DialogTitle>
            <DialogDescription>
              Card-only movements stay outside Records unless you choose an
              account impact.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={submitMovement}>
            <label className="space-y-2">
              <span className="text-sm font-medium">Amount</span>
              <input
                className={field}
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Currency</span>
              <select
                className={field}
                value={currency}
                onChange={(event) => {
                  const next = event.target.value as CurrencyCode;
                  setCurrency(next);
                  if (next === card.limitCurrency) setRate("1");
                }}
              >
                {currencies.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">
                Rate to {card.limitCurrency}
              </span>
              <input
                className={field}
                type="number"
                step="0.000001"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium">Category</span>
              <CategoryPicker
                categories={dataset.categories}
                value={categoryId}
                onChange={setCategoryId}
                inputClassName={field}
                getLabel={(category) =>
                  formatCategoryName(dataset.categories, category)
                }
              />
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium">Counterparty</span>
              <input
                className={field}
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Date</span>
              <input
                className={field}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={impactAccount}
                onChange={(event) => setImpactAccount(event.target.checked)}
              />{" "}
              Affect an account now
            </label>
            {impactAccount ? (
              <>
                <select
                  className={field}
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  <option value="">Account</option>
                  {dataset.accounts
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <input
                  className={field}
                  type="number"
                  step="0.01"
                  placeholder="Account amount"
                  value={accountAmount}
                  onChange={(event) => setAccountAmount(event.target.value)}
                />
              </>
            ) : null}
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Note</span>
              <input
                className={field}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit">Save movement</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMovement(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Limit usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-semibold">
              {formatMoney(summary.usedLimit, card.limitCurrency)}
            </p>
            <Progress value={Math.min(100, summary.utilizationPercent)} />
            <p className="text-sm text-muted-foreground">
              {formatMoney(summary.availableLimit, card.limitCurrency)}{" "}
              available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current cycle</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.currentCycle.map((item) => (
              <p key={item.currency} className="text-xl font-semibold">
                {formatMoney(item.amount, item.currency)}
              </p>
            ))}
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.currentCycleStart} to {summary.currentCycleEnd}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={summary.status === "ok" ? "success" : "danger"}>
              {payableStatement?.status ?? summary.status.replace("_", " ")}
            </Badge>
            {payableStatement && payableStatementBalance ? (
              <>
                <div>
                  <p className="text-2xl font-semibold">
                    {formatMoney(
                      payableStatementBalance.dueAmountInLimitCurrency,
                      card.limitCurrency,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Amount due</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total{" "}
                  {formatMoney(
                    payableStatementBalance.totalAmountInLimitCurrency,
                    card.limitCurrency,
                  )}
                  {payableStatementBalance.paidAmountInLimitCurrency > 0
                    ? ` · paid ${formatMoney(
                        payableStatementBalance.paidAmountInLimitCurrency,
                        card.limitCurrency,
                      )}`
                    : ""}
                </p>
                {payableStatementBalance.currencyBreakdown.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {payableStatementBalance.currencyBreakdown.map((item) => (
                      <Badge key={item.currency} variant="muted">
                        {formatMoney(item.amount, item.currency)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {payableStatement
                ? `Due ${payableStatement.dueAt.slice(0, 10)}`
                : "No closed statement pending"}
            </p>
          </CardContent>
        </Card>
      </div>

      {payableStatement ? (
        <Card>
          <CardHeader>
            <CardTitle>Pay statement</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-4"
              onSubmit={submitPayment}
            >
              <div className="flex gap-2">
                <input
                  className={field}
                  type="number"
                  step="0.01"
                  placeholder={`Amount in ${card.limitCurrency}`}
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fillFullPaymentAmount}
                  disabled={
                    !payableStatementBalance ||
                    payableStatementBalance.dueAmountInLimitCurrency <= 0
                  }
                >
                  Full
                </Button>
              </div>
              <select
                className={field}
                value={paymentAccountId}
                onChange={(event) => setPaymentAccountId(event.target.value)}
              >
                <option value="">External payment</option>
                {dataset.accounts
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
              {paymentAccountId ? (
                <input
                  className={field}
                  type="number"
                  step="0.01"
                  placeholder="Amount debited"
                  value={paymentAccountAmount}
                  onChange={(event) =>
                    setPaymentAccountAmount(event.target.value)
                  }
                />
              ) : (
                <div />
              )}
              <Button type="submit">Pay</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Movements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="flex items-center justify-between border-b pb-3"
              >
                <div className="flex gap-2">
                  <ReceiptText className="mt-1 h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">
                      {movement.counterpartyName ??
                        movement.note ??
                        "Card movement"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {movement.occurredAt.slice(0, 10)} ·{" "}
                      {movement.walletRecordId
                        ? "Linked to Records"
                        : "Card only"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p
                    className={
                      movement.kind === "refund"
                        ? "font-medium text-emerald-600"
                        : "font-medium"
                    }
                  >
                    {movement.kind === "refund" ? "+" : "-"}
                    {formatMoney(movement.amount, movement.currency)}
                  </p>
                  {movement.kind === "purchase" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Refund"
                      onClick={() => void refund(movement.id)}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {!movement.walletRecordId ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Edit"
                        onClick={() => openEditMovement(movement)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete"
                        onClick={() =>
                          void deleteCreditCardRecord(cardId, movement.id)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between border-b pb-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatMoney(payment.amount, payment.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payment.occurredAt.slice(0, 10)} ·{" "}
                    {payment.accountId ? "Account" : "External"}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    void deleteCreditCardPayment(cardId, payment.id)
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
