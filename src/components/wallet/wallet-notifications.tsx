import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { walletAttention } from "@/lib/wallet-attention";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney } from "@shared/calculations";
import { debtDirectionLabels } from "@shared/constants";

export function WalletNotifications() {
  const navigate = useNavigate();
  const {
    dataset,
    isAllHistoryComplete,
    clearRecordFilters,
    setRecordFilters,
    setAllPeriod,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const attention = isAllHistoryComplete ? walletAttention(dataset) : null;
  const count = attention
    ? attention.review + attention.debts.length + attention.statements.length
    : 0;

  function goTo(href: string, review = false) {
    clearRecordFilters();
    setAllPeriod();
    if (review) setRecordFilters({ paymentStatus: "needs_review" });
    setOpen(false);
    navigate(href);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label="Notifications"
          title={
            attention
              ? `${count} pending notifications`
              : "Loading notifications"
          }
          onClick={() => setOpen(!open)}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span
              aria-label="Pending notifications"
              className="absolute -right-2 -top-2 min-w-5 rounded-full bg-amber-500 px-1 text-xs font-semibold leading-5 text-black"
            >
              {count}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      {open && (
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            aria-label="Wallet notifications"
            className="z-50 max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-card p-4 text-foreground shadow-lg"
          >
            <h2 className="font-semibold">Notifications</h2>
            {!attention ? (
              <p role="status" className="mt-3 text-sm text-muted-foreground">
                Loading complete history...
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {attention.review > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => goTo("/records", true)}
                  >
                    Review {attention.review} pending{" "}
                    {attention.review === 1 ? "record" : "records"}
                  </Button>
                )}
                <section aria-label="Debts due soon">
                  <h3 className="text-sm font-medium">
                    Overdue or due within 7 days
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {attention.debts.map((debt) => (
                      <li key={debt.id}>
                        <button
                          type="button"
                          aria-label={`Open debt ${debt.name}`}
                          onClick={() => goTo("/debts")}
                          className="w-full rounded-md border p-3 text-left hover:bg-secondary focus-visible:outline focus-visible:outline-ring"
                        >
                          <span className="block text-sm font-medium">
                            {debt.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {debtDirectionLabels[debt.direction]} · Due{" "}
                            {debt.dueAt!.slice(0, 10)} ·{" "}
                            {debt.pendingAmount === undefined
                              ? "Amount not set"
                              : formatMoney(debt.pendingAmount, debt.currency)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
                {attention.review === 0 && attention.debts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No pending reviews or debts due soon.
                  </p>
                )}
                <section aria-label="Pending card statements">
                  <h3 className="text-sm font-medium">
                    Unpaid closed statements
                  </h3>
                  {attention.statements.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      All closed statements are settled.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {attention.statements.map((entry) => (
                        <li key={entry.statement.id}>
                          <button
                            type="button"
                            aria-label={`Open statement ${entry.card.name}`}
                            onClick={() => goTo(entry.href)}
                            className="w-full rounded-md border p-3 text-left hover:bg-secondary focus-visible:outline focus-visible:outline-ring"
                          >
                            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {entry.card.name}
                              {!entry.card.isActive && (
                                <Badge variant="muted">Archived</Badge>
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Due {entry.statement.dueAt.slice(0, 10)} ·{" "}
                              {formatMoney(
                                entry.dueAmountInLimitCurrency,
                                entry.card.limitCurrency,
                              )}
                            </span>
                            <Badge
                              variant={
                                entry.urgency === "overdue"
                                  ? "danger"
                                  : entry.urgency === "later"
                                    ? "muted"
                                    : "warning"
                              }
                              className="mt-2"
                            >
                              {entry.urgency === "overdue"
                                ? "Overdue"
                                : entry.urgency === "today"
                                  ? "Due today"
                                  : entry.urgency === "soon"
                                    ? "Next 7 days"
                                    : "Upcoming"}
                            </Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
