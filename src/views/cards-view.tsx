import { formatMoney } from "@shared/money";
import { CreditCard as CreditCardIcon, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CreditCard } from "@shared/types";

import { readableForeground } from "@/lib/palette";
import { PageHeader } from "@/components/page/page-header";
import { ReadState } from "@/components/page/read-state";
import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LimitUsageAlert } from "@/components/wallet/limit-usage-alert";
import { CardFormDialog } from "@/features/cards/CardFormDialog";
import { CardMailSettingsDialog } from "@/features/cards/CardMailSettingsDialog";
import { useCardReads } from "@/features/cards/use-card-reads";
import { draftFromCard, emptyDraft, type CardDraft } from "@/lib/card-draft";
import { useActionToast } from "@/lib/use-action-toast";
import { formatCalendarDate } from "@/lib/utils";
import { useWallet } from "@/providers/wallet-provider";

export function CardsView() {
  const navigate = useNavigate();
  const {
    dataset,
    selectedMonth,
    selectedPeriodMode,
    selectedDateRange,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
  } = useWallet();
  const [draft, setDraft] = useState<CardDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [noticeCard, setNoticeCard] = useState<CreditCard | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast, runAction } = useActionToast();
  const reads = useCardReads({
    ...selectedDateRange,
    selectedMonth,
    periodMode: selectedPeriodMode,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const pendingStatements = reads.agenda.data ?? [];
  const cardSummaries = reads.entries;
  const hasCardData = !reads.isPending && !reads.isError;

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
    if (isSaving) return;
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
      setError("Complete the card details, limit, last four digits, closing and due days.");
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
        {
          const actionResult = await runAction(() => updateCreditCard(editingId, payload), {
            singleFlight: "save-card",
            processing: "Saving card...",
            success: "Card saved",
            error: "Could not save card",
          });
          if (!actionResult.ok) {
            const nextError = actionResult.error;
            setError(nextError instanceof Error ? nextError.message : "Could not save card");
            return;
          }
        }
      } else {
        {
          const actionResult = await runAction(() => addCreditCard(payload), {
            singleFlight: "save-card",
            processing: "Creating card...",
            success: "Card created",
            error: "Could not create card",
          });
          if (!actionResult.ok) {
            const nextError = actionResult.error;
            setError(nextError instanceof Error ? nextError.message : "Could not save card");
            return;
          }
        }
      }
      setShowForm(false);
      setEditingId(null);
      setDraft(emptyDraft());
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

      <CardFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        draft={draft}
        editingId={editingId}
        error={error}
        busy={isSaving}
        onFieldChange={setField}
        onSubmit={submit}
      />
      {noticeCard && (
        <CardMailSettingsDialog
          card={noticeCard}
          accounts={dataset.accounts}
          onClose={() => setNoticeCard(null)}
        />
      )}

      {hasCardData ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {cardSummaries.map(({ summary, categoryUsage, expenseTrend }) => {
            const cardStatements = pendingStatements.filter(
              (entry) => entry.card.id === summary.card.id,
            );
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
                className={`transition hover:border-primary/50 hover:shadow-md ${!summary.card.isActive ? "opacity-60" : ""}`}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-md text-white"
                      style={{
                        backgroundColor: summary.card.color,
                        color: readableForeground(summary.card.color),
                      }}
                    >
                      <CreditCardIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>
                        <Link
                          className="rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                          to={`/cards/${summary.card.id}`}
                        >
                          {summary.card.name}
                        </Link>
                      </CardTitle>
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
                  {hasCardData && (
                    <LimitUsageAlert utilizationPercent={summary.utilizationPercent} />
                  )}
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
                              formatMoney(Number(value), summary.card.limitCurrency)
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                        <p className="text-xs text-muted-foreground">Free</p>
                        <p className="text-sm font-semibold">
                          {formatMoney(summary.availableLimit, summary.card.limitCurrency)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Used</p>
                          <p className="font-semibold">
                            {formatMoney(summary.usedLimit, summary.card.limitCurrency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Available</p>
                          <p className="font-semibold">
                            {formatMoney(summary.availableLimit, summary.card.limitCurrency)}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-1.5 text-xs sm:grid-cols-2">
                        {chartData.map((item) => (
                          <div key={item.id} className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: item.color,
                                color: readableForeground(item.color),
                              }}
                            />
                            <span className="truncate text-muted-foreground">{item.name}</span>
                            <span className="ml-auto font-medium">
                              {formatMoney(item.amount, summary.card.limitCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Progress
                    value={Math.min(100, summary.utilizationPercent)}
                    indicatorStyle={{ backgroundColor: summary.card.color }}
                  />
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      Current cycle: {formatCalendarDate(summary.currentCycleStart)} –{" "}
                      {formatCalendarDate(summary.currentCycleEnd)}
                    </p>
                    <p>Closes {formatCalendarDate(summary.currentCycleEnd)}</p>
                    {!hasCardData ? (
                      <p>Loading closed statements...</p>
                    ) : cardStatements.length ? (
                      cardStatements.map((entry) => (
                        <button
                          key={entry.statement.id}
                          type="button"
                          className="block w-full rounded-md border p-2 text-left hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void navigate(entry.href);
                          }}
                        >
                          <span className="block">
                            Statement closed {formatCalendarDate(entry.statement.cycleEnd)}
                          </span>
                          <span className="block font-medium text-foreground">
                            {entry.urgency === "overdue" ? "Overdue" : "Due"}{" "}
                            {formatCalendarDate(entry.statement.dueAt)} ·{" "}
                            {formatMoney(
                              entry.dueAmountInLimitCurrency,
                              summary.card.limitCurrency,
                            )}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p>No closed statement pending</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {summary.outstanding.map((item) => (
                      <Badge key={item.currency} variant="muted">
                        Outstanding {formatMoney(item.amount, item.currency)}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="border-transparent text-white hover:opacity-90"
                      style={{
                        backgroundColor: summary.card.color,
                        color: readableForeground(summary.card.color),
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigate(`/cards/${summary.card.id}`);
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
                    {summary.card.isActive && (
                      <Button variant="outline" onClick={() => setNoticeCard(summary.card)}>
                        Bank notices
                      </Button>
                    )}
                    {summary.card.isActive ? (
                      <Button
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          void runAction(() => deleteCreditCard(summary.card.id), {
                            processing: "Archiving card...",
                            success: "Card archived",
                            error: "Could not archive card",
                          });
                        }}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                  <div className="rounded-md border bg-card/60 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Expense trend by period</p>
                      <Badge variant="muted">{dataset.settings.primaryCurrency}</Badge>
                    </div>
                    <div className="h-56 min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={expenseTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="day" tickLine={false} axisLine={false} />
                          <YAxis
                            width={80}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) =>
                              formatMoney(Number(value), dataset.settings.primaryCurrency)
                            }
                          />
                          <Tooltip
                            formatter={(value) =>
                              formatMoney(Number(value), dataset.settings.primaryCurrency)
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="current"
                            name="Current period"
                            stroke={summary.card.color}
                            strokeWidth={3}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="previous"
                            name="Previous period"
                            stroke="#F59E0B"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="previousPrevious"
                            name="Two periods ago"
                            stroke="#94A3B8"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <ReadState label="cards" error={reads.isError} />
          {reads.refreshError && (
            <>
              <p role="alert">{reads.refreshError}</p>
              <Button variant="outline" onClick={reads.retryRefresh} disabled={reads.isRefreshing}>
                Retry cards
              </Button>
            </>
          )}
        </div>
      )}

      {hasCardData && cardSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Create your first credit card to start tracking its limit and statement.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
