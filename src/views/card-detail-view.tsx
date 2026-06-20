import { FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Plus, ReceiptText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useActionToast } from "@/lib/use-action-toast";
import { useWallet } from "@/providers/wallet-provider";
import { calculateCreditCardSummary, formatMoney } from "@shared/calculations";
import type { CurrencyCode } from "@shared/types";

const fieldClassName =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function CardDetailView() {
  const { cardId = "" } = useParams();
  const navigate = useNavigate();
  const { dataset, addCreditCardPayment, requestNewRecord, setRecordFilters } =
    useWallet();
  const card = dataset.creditCards.find((item) => item.id === cardId);
  const summary = useMemo(
    () => (card ? calculateCreditCardSummary(dataset, card) : null),
    [card, dataset],
  );
  const records = dataset.records.filter(
    (record) => record.creditCardId === cardId,
  );
  const payments = dataset.creditCardPayments.filter(
    (payment) => payment.creditCardId === cardId,
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    summary?.outstanding[0]?.currency ?? card?.limitCurrency ?? "UYU",
  );
  const [limitAmount, setLimitAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountAmount, setAccountAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const { toast, runAction } = useActionToast();

  if (!card || !summary) {
    return (
      <Card>
        <CardContent className="py-12 text-center">Card not found.</CardContent>
      </Card>
    );
  }

  function addMovement() {
    requestNewRecord();
    setRecordFilters({ creditCardId: cardId, accountId: undefined });
    navigate("/records");
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!card) return;
    const numericAmount = Number(amount);
    const numericLimitAmount =
      currency === card.limitCurrency ? numericAmount : Number(limitAmount);
    const numericAccountAmount = accountId ? Number(accountAmount) : undefined;
    const now = new Date();
    const paymentOccurredAt =
      occurredAt === format(now, "yyyy-MM-dd")
        ? now.toISOString()
        : new Date(`${occurredAt}T12:00:00`).toISOString();
    if (
      numericAmount <= 0 ||
      numericLimitAmount <= 0 ||
      (accountId && !numericAccountAmount)
    ) {
      setError(
        "Enter the debt amount, its limit equivalent and the account amount when applicable.",
      );
      return;
    }
    try {
      await runAction(
        () =>
          addCreditCardPayment(cardId, {
            amount: numericAmount,
            currency,
            amountInLimitCurrency: numericLimitAmount,
            accountId: accountId || undefined,
            accountAmount: numericAccountAmount,
            occurredAt: paymentOccurredAt,
            note: note.trim() || undefined,
          }),
        {
          processing: "Saving payment...",
          success: "Payment saved",
          error: "Could not save payment",
        },
      );
      setAmount("");
      setLimitAmount("");
      setAccountAmount("");
      setNote("");
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not save payment",
      );
    }
  }

  return (
    <div className="space-y-6">
      <ActionToast toast={toast} />
      <Button variant="ghost" onClick={() => navigate("/cards")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Cards
      </Button>
      <PageHeader
        title={`${card.name} •••• ${card.lastFour}`}
        description={`${card.issuer} · closes day ${card.closingDay} · due day ${card.dueDay}`}
      >
        <Button onClick={addMovement}>
          <Plus className="mr-2 h-4 w-4" />
          Add movement
        </Button>
      </PageHeader>
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
          <CardContent className="space-y-2">
            {summary.currentCycle.length ? (
              summary.currentCycle.map((item) => (
                <p key={item.currency} className="text-xl font-semibold">
                  {formatMoney(item.amount, item.currency)}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">No movements</p>
            )}
            <p className="text-xs text-muted-foreground">
              {summary.currentCycleStart} to {summary.currentCycleEnd}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Statement due</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.statementDue.length ? (
              summary.statementDue.map((item) => (
                <p key={item.currency} className="text-xl font-semibold">
                  {formatMoney(item.amount, item.currency)}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">Paid</p>
            )}
            <Badge variant={summary.status === "ok" ? "success" : "danger"}>
              {summary.status.replace("_", " ")}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Due {summary.dueDate}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record a payment</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={submitPayment}>
            <label className="space-y-2">
              <span className="text-sm font-medium">Debt currency</span>
              <select
                className={fieldClassName}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {["UYU", "USD", "EUR", "BRL", "ARS"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Debt amount</span>
              <input
                className={fieldClassName}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {currency !== card.limitCurrency ? (
              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Equivalent in {card.limitCurrency}
                </span>
                <input
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  value={limitAmount}
                  onChange={(e) => setLimitAmount(e.target.value)}
                />
              </label>
            ) : null}
            <label className="space-y-2">
              <span className="text-sm font-medium">
                Source account (optional)
              </span>
              <select
                className={fieldClassName}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">External payment</option>
                {dataset.accounts
                  .filter((item) => item.isActive)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
              </select>
            </label>
            {accountId ? (
              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Amount debited from account
                </span>
                <input
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  value={accountAmount}
                  onChange={(e) => setAccountAmount(e.target.value)}
                />
              </label>
            ) : null}
            <label className="space-y-2">
              <span className="text-sm font-medium">Date</span>
              <input
                className={fieldClassName}
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Note</span>
              <input
                className={fieldClassName}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error ? (
              <p className="text-sm text-destructive md:col-span-3">{error}</p>
            ) : null}
            <div className="md:col-span-3">
              <Button type="submit">Save payment</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Movements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {records.map((record) => {
              const category = dataset.categories.find(
                (item) => item.id === record.categoryId,
              );
              return (
                <div
                  key={record.id}
                  className="flex items-center justify-between border-b pb-3"
                >
                  <div className="flex items-center gap-2">
                    <ReceiptText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {record.counterpartyName ??
                          record.note ??
                          "Card movement"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.occurredAt.slice(0, 10)}
                        {category ? ` · ${category.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium">
                    {formatMoney(record.amount, record.currency)}
                  </p>
                </div>
              );
            })}
            {records.length === 0 ? (
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
                    {payment.note ?? "Card payment"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payment.occurredAt.slice(0, 10)}
                  </p>
                </div>
                <p className="font-medium">
                  {formatMoney(payment.amount, payment.currency)}
                </p>
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
