import { FormEvent, useMemo, useState } from "react";
import { CreditCard as CreditCardIcon, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionToast } from "@/lib/use-action-toast";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateCreditCardCategoryUsage,
  calculateCreditCardSummaries,
  formatMoney,
} from "@shared/calculations";
import type { CreditCard, CurrencyCode } from "@shared/types";

const currencies: CurrencyCode[] = ["UYU", "USD", "EUR", "BRL", "ARS"];
const fieldClassName =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface CardDraft {
  name: string;
  issuer: string;
  lastFour: string;
  creditLimit: string;
  limitCurrency: CurrencyCode;
  closingDay: string;
  dueDay: string;
  color: string;
  note: string;
}

function emptyDraft(): CardDraft {
  return {
    name: "",
    issuer: "",
    lastFour: "",
    creditLimit: "",
    limitCurrency: "UYU",
    closingDay: "20",
    dueDay: "5",
    color: "#2563EB",
    note: "",
  };
}

function draftFromCard(card: CreditCard): CardDraft {
  return {
    name: card.name,
    issuer: card.issuer,
    lastFour: card.lastFour,
    creditLimit: String(card.creditLimit),
    limitCurrency: card.limitCurrency,
    closingDay: String(card.closingDay),
    dueDay: String(card.dueDay),
    color: card.color,
    note: card.note ?? "",
  };
}

export function CardsView() {
  const navigate = useNavigate();
  const { dataset, addCreditCard, updateCreditCard, deleteCreditCard } =
    useWallet();
  const [draft, setDraft] = useState<CardDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast, runAction } = useActionToast();
  const cardSummaries = useMemo(
    () =>
      calculateCreditCardSummaries(dataset).map((summary) => ({
        summary,
        categoryUsage: calculateCreditCardCategoryUsage(dataset, summary.card),
      })),
    [dataset],
  );

  function setField<K extends keyof CardDraft>(key: K, value: CardDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
    setShowForm(true);
  }

  function startEdit(card: CreditCard) {
    setEditingId(card.id);
    setDraft(draftFromCard(card));
    setError("");
    setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const creditLimit = Number(draft.creditLimit);
    const closingDay = Number(draft.closingDay);
    const dueDay = Number(draft.dueDay);
    if (
      !draft.name.trim() ||
      !draft.issuer.trim() ||
      !/^\d{4}$/.test(draft.lastFour) ||
      creditLimit <= 0 ||
      closingDay < 1 ||
      closingDay > 31 ||
      dueDay < 1 ||
      dueDay > 31
    ) {
      setError(
        "Complete the card details, limit, last four digits, closing and due days.",
      );
      return;
    }
    const payload: Omit<CreditCard, "id"> = {
      name: draft.name.trim(),
      issuer: draft.issuer.trim(),
      lastFour: draft.lastFour,
      creditLimit,
      limitCurrency: draft.limitCurrency,
      closingDay,
      dueDay,
      color: draft.color,
      icon: "credit-card",
      isActive: true,
      note: draft.note.trim() || undefined,
    };
    setIsSaving(true);
    setError("");
    try {
      if (editingId) {
        await runAction(() => updateCreditCard(editingId, payload), {
          processing: "Saving card...",
          success: "Card saved",
          error: "Could not save card",
        });
      } else {
        await runAction(() => addCreditCard(payload), {
          processing: "Creating card...",
          success: "Card created",
          error: "Could not create card",
        });
      }
      setShowForm(false);
      setEditingId(null);
      setDraft(emptyDraft());
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Could not save card",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <ActionToast toast={toast} />
      <PageHeader
        title="Cards"
        description="Track credit limits, billing cycles, statements and payments without changing bank balances when you spend."
      >
        <Button onClick={startCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New card
        </Button>
      </PageHeader>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit card" : "New card"}</DialogTitle>
            <DialogDescription>
              Configure the card identity, limit and billing dates.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <label className="space-y-2">
              <span className="text-sm font-medium">Name</span>
              <input
                className={fieldClassName}
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Itaú Internacional"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Issuer</span>
              <input
                className={fieldClassName}
                value={draft.issuer}
                onChange={(e) => setField("issuer", e.target.value)}
                placeholder="Itaú"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Last four digits</span>
              <input
                className={fieldClassName}
                value={draft.lastFour}
                onChange={(e) =>
                  setField(
                    "lastFour",
                    e.target.value.replace(/\D/g, "").slice(0, 4),
                  )
                }
                inputMode="numeric"
                placeholder="4006"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Limit</span>
              <div className="flex gap-2">
                <select
                  className={fieldClassName}
                  value={draft.limitCurrency}
                  onChange={(e) =>
                    setField("limitCurrency", e.target.value as CurrencyCode)
                  }
                >
                  {currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
                <input
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.creditLimit}
                  onChange={(e) => setField("creditLimit", e.target.value)}
                />
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Closing day</span>
              <input
                className={fieldClassName}
                type="number"
                min="1"
                max="31"
                value={draft.closingDay}
                onChange={(e) => setField("closingDay", e.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Due day</span>
              <input
                className={fieldClassName}
                type="number"
                min="1"
                max="31"
                value={draft.dueDay}
                onChange={(e) => setField("dueDay", e.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Color</span>
              <input
                className={fieldClassName}
                type="color"
                value={draft.color}
                onChange={(e) => setField("color", e.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Note</span>
              <input
                className={fieldClassName}
                value={draft.note}
                onChange={(e) => setField("note", e.target.value)}
              />
            </label>
            {error ? (
              <p className="text-sm text-destructive md:col-span-2">{error}</p>
            ) : null}
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save card"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 xl:grid-cols-2">
        {cardSummaries.map(({ summary, categoryUsage }) => {
          const chartData = [
            ...categoryUsage.map((category) => ({
              ...category,
              value: category.amount,
            })),
            ...(summary.availableLimit > 0
              ? [
                  {
                    id: "available",
                    name: "Free",
                    color: "hsl(var(--muted))",
                    amount: summary.availableLimit,
                    value: summary.availableLimit,
                  },
                ]
              : []),
          ];

          return (
            <Card
              key={summary.card.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/cards/${summary.card.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/cards/${summary.card.id}`);
                }
              }}
              className={`cursor-pointer transition hover:border-primary/50 hover:shadow-md ${!summary.card.isActive ? "opacity-60" : ""}`}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-md text-white"
                    style={{ backgroundColor: summary.card.color }}
                  >
                    <CreditCardIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{summary.card.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {summary.card.issuer} •••• {summary.card.lastFour}
                    </p>
                  </div>
                </div>
                <Badge variant={summary.status === "ok" ? "success" : "danger"}>
                  {summary.status.replace("_", " ")}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid items-center gap-4 sm:grid-cols-[11rem_1fr]">
                  <div className="relative h-44 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={76}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {chartData.map((item) => (
                            <Cell key={item.id} fill={item.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            formatMoney(
                              Number(value),
                              summary.card.limitCurrency,
                            )
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                      <p className="text-xs text-muted-foreground">Free</p>
                      <p className="text-sm font-semibold">
                        {formatMoney(
                          summary.availableLimit,
                          summary.card.limitCurrency,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Used</p>
                        <p className="font-semibold">
                          {formatMoney(
                            summary.usedLimit,
                            summary.card.limitCurrency,
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-semibold">
                          {formatMoney(
                            summary.availableLimit,
                            summary.card.limitCurrency,
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-1.5 text-xs sm:grid-cols-2">
                      {chartData.map((item) => (
                        <div
                          key={item.id}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate text-muted-foreground">
                            {item.name}
                          </span>
                          <span className="ml-auto font-medium">
                            {formatMoney(
                              item.amount,
                              summary.card.limitCurrency,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <Progress value={Math.min(100, summary.utilizationPercent)} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Closes {summary.currentCycleEnd}</span>
                  <span>Due {summary.dueDate}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summary.outstanding.map((item) => (
                    <Badge key={item.currency} variant="muted">
                      Due {formatMoney(item.amount, item.currency)}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/cards/${summary.card.id}`);
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      startEdit(summary.card);
                    }}
                  >
                    Edit
                  </Button>
                  {summary.card.isActive ? (
                    <Button
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAction(
                          () => deleteCreditCard(summary.card.id),
                          {
                            processing: "Archiving card...",
                            success: "Card archived",
                            error: "Could not archive card",
                          },
                        );
                      }}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {cardSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Create your first credit card to start tracking its limit and
            statement.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
