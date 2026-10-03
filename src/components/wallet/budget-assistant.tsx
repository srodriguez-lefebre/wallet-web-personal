import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import { reportDataset } from "@/lib/preferences";
import { useWallet } from "@/providers/wallet-provider";
import {
  buildBudgetPlan,
  conflictingCategoryBudgets,
} from "@shared/budget-planning";
import { formatMoney } from "@shared/calculations";
import { budgetSchema } from "@shared/schemas";
import type { BudgetPlan, BudgetProposal } from "@shared/budget-planning";
import type { WalletDataset } from "@shared/types";

type Choice = { selected: boolean; amount: string };
type Outcome =
  | "confirmed"
  | "reconciled"
  | "conflict"
  | "uncertain"
  | "unavailable";
const field =
  "h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

export function BudgetAssistant({
  initialMonth,
  onBusyChange,
}: {
  initialMonth: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { getCompleteDataset, addBudget } = useWallet();
  const initialRead = useRef(getCompleteDataset);
  const active = useRef(true);
  const saving = useRef(false);
  const [history, setHistory] = useState<WalletDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [targetMonth, setTargetMonth] = useState(initialMonth);
  const [margin, setMargin] = useState("10");
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [error, setError] = useState<string | null>(null);
  const { toast, runAction } = useActionToast();

  useEffect(() => {
    active.current = true;
    void initialRead
      .current()
      .then((value) => {
        if (active.current) setHistory(value);
      })
      .catch((reason) => {
        if (active.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load complete history.",
          );
      })
      .finally(() => {
        if (active.current) setLoading(false);
      });
    return () => {
      active.current = false;
    };
  }, []);

  const { plan, planningError } = useMemo<{
    plan: BudgetPlan | null;
    planningError: string | null;
  }>(() => {
    if (!history) return { plan: null, planningError: null };
    try {
      return {
        plan: buildBudgetPlan(
          reportDataset(history),
          targetMonth,
          margin.trim() ? Number(margin) : Number.NaN,
          history.budgets,
        ),
        planningError: null,
      };
    } catch (reason) {
      return {
        plan: null,
        planningError:
          reason instanceof Error
            ? reason.message
            : "Could not calculate proposals.",
      };
    }
  }, [history, targetMonth, margin]);
  function choiceFor(proposal: BudgetProposal): Choice {
    return (
      choices[proposal.categoryId] ?? {
        selected: proposal.status === "ready",
        amount: String(proposal.limitAmount ?? ""),
      }
    );
  }
  function completed(id: string) {
    return ["confirmed", "reconciled", "conflict", "unavailable"].includes(
      outcomes[id],
    );
  }
  const selected =
    plan?.proposals.filter(
      (proposal) =>
        proposal.status === "ready" &&
        !completed(proposal.categoryId) &&
        choiceFor(proposal).selected,
    ) ?? [];
  const invalidAmounts = selected.some(
    (proposal) =>
      !Number.isFinite(Number(choiceFor(proposal).amount)) ||
      Number(choiceFor(proposal).amount) <= 0,
  );
  const confirmed = Object.values(outcomes).filter(
    (value) => value === "confirmed",
  ).length;
  const reconciled = Object.values(outcomes).filter(
    (value) => value === "reconciled",
  ).length;
  const skipped = Object.values(outcomes).filter(
    (value) => value === "conflict" || value === "unavailable",
  ).length;

  function resetPlanning() {
    setChoices({});
    setOutcomes({});
    setError(null);
  }

  async function reloadHistory() {
    if (saving.current) return;
    setLoading(true);
    setError(null);
    try {
      setHistory(await getCompleteDataset());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load complete history.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (saving.current || !plan || !selected.length || invalidAmounts) return;
    saving.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    const currentPlan = plan;
    const batch = selected.map((proposal) => ({
      proposal,
      amount: Number(choiceFor(proposal).amount),
    }));
    try {
      await runAction(
        async () => {
          // A rejected create may have committed before its canonical reload failed.
          // No write is safe to retry until this fresh canonical read succeeds.
          const current = await getCompleteDataset();
          const currentBudgets = [...current.budgets];
          if (current.settings.primaryCurrency !== currentPlan.currency)
            throw new Error(
              "Primary currency changed. Reload proposals before saving.",
            );
          for (const { proposal, amount } of batch) {
            if (!active.current) break;
            const category = current.categories.find(
              (value) => value.id === proposal.categoryId,
            );
            if (!category || category.parentId) {
              setOutcomes((values) => ({
                ...values,
                [proposal.categoryId]: "unavailable",
              }));
              continue;
            }
            const conflicts = conflictingCategoryBudgets(
              current.categories,
              currentBudgets,
              proposal.categoryId,
            );
            if (conflicts.length) {
              setOutcomes((values) => ({
                ...values,
                [proposal.categoryId]:
                  values[proposal.categoryId] === "uncertain"
                    ? "reconciled"
                    : "conflict",
              }));
              continue;
            }
            const payload = budgetSchema.parse({
              name: category.name,
              categoryId: category.id,
              color: category.color,
              limitAmount: amount,
              currency: currentPlan.currency,
              period: "monthly",
              isActive: true,
            });
            try {
              const id = await addBudget(payload);
              currentBudgets.push({ ...payload, id });
              setOutcomes((values) => ({
                ...values,
                [proposal.categoryId]: "confirmed",
              }));
            } catch (reason) {
              setOutcomes((values) => ({
                ...values,
                [proposal.categoryId]: "uncertain",
              }));
              throw reason;
            }
          }
        },
        {
          processing: "Checking current budgets and saving selections…",
          success: "Budget selections processed. Review the results below.",
          error:
            "Budget batch stopped. Review the results and reconcile before retrying.",
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Budget batch stopped. Reconcile before retrying.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        New monthly budgets apply every month. The target month only selects the
        three earlier calendar months used for the estimate.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>Target month</span>
          <input
            className={field}
            aria-label="Target month"
            type="month"
            value={targetMonth}
            disabled={busy}
            onChange={(event) => {
              setTargetMonth(event.target.value);
              resetPlanning();
            }}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Margin above monthly average (%)</span>
          <input
            className={field}
            aria-label="Margin percent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={margin}
            disabled={busy}
            onChange={(event) => {
              setMargin(event.target.value);
              resetPlanning();
            }}
          />
        </label>
      </div>
      {loading ? (
        <p role="status" className="text-sm">
          Loading complete history…
        </p>
      ) : null}
      {plan ? (
        <>
          <div className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
            <p>
              Source: {plan.sourceMonths.join(", ")} · Currency: {plan.currency}
            </p>
            <p className="mt-1">
              Average = three-month spending ÷ 3, including months with no
              expenses. Suggested limits round upward to the next cent after
              adding the margin.
            </p>
            <p className="mt-1">
              Uses report account preferences and frozen historical conversions.
              Includes cleared and pending expenses; excludes cancelled and
              review drafts. Subcategories roll into their main category. Linked
              card entries are not added again. Uncategorized expenses do not
              generate budgets.
            </p>
            <p className="mt-1">
              Scope:{" "}
              {history?.settings.includeHiddenAccountsInReports
                ? "all report accounts, including hidden accounts"
                : "visible report accounts"}
              ; no account filter. Each new budget covers the whole category.
            </p>
          </div>
          {!plan.proposals.length ? (
            <p className="text-sm text-muted-foreground">
              No eligible category expenses in the source period.
            </p>
          ) : (
            <div className="space-y-3">
              {plan.proposals.map((proposal) => {
                const choice = choiceFor(proposal);
                const outcome = outcomes[proposal.categoryId];
                const disabled =
                  busy ||
                  proposal.status !== "ready" ||
                  completed(proposal.categoryId);
                const conflicts = history!.budgets.filter((budget) =>
                  proposal.conflictingBudgetIds.includes(budget.id),
                );
                return (
                  <div
                    key={proposal.categoryId}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${proposal.name}`}
                        checked={
                          choice.selected &&
                          proposal.status === "ready" &&
                          !completed(proposal.categoryId)
                        }
                        disabled={disabled}
                        onChange={(event) =>
                          setChoices((values) => ({
                            ...values,
                            [proposal.categoryId]: {
                              ...choice,
                              selected: event.target.checked,
                            },
                          }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{proposal.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Monthly average:{" "}
                          {proposal.average === null
                            ? "Unavailable"
                            : formatMoney(proposal.average, plan.currency)}
                        </p>
                      </div>
                      <label className="w-32 text-xs text-muted-foreground">
                        <span>Monthly limit ({plan.currency})</span>
                        <input
                          className={field}
                          aria-label={`Limit for ${proposal.name}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          disabled={disabled}
                          value={choice.amount}
                          onChange={(event) =>
                            setChoices((values) => ({
                              ...values,
                              [proposal.categoryId]: {
                                ...choice,
                                amount: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                    {proposal.status === "missing_exchange_rate" ? (
                      <p className="mt-2 text-sm text-destructive">
                        Historical exchange rate unavailable. This category
                        cannot be estimated.
                      </p>
                    ) : null}
                    {proposal.status === "conflict" ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Existing active budget:{" "}
                        {conflicts
                          .map(
                            (budget) => `${budget.name} (${budget.currency})`,
                          )
                          .join(", ")}
                        . Category scopes overlap; creation disabled.
                      </p>
                    ) : null}
                    {outcome ? (
                      <p className="mt-2 text-sm" role="status">
                        {outcome === "confirmed"
                          ? "Confirmed saved"
                          : outcome === "reconciled"
                            ? "Reconciled: active budget found; skipped creation"
                            : outcome === "conflict"
                              ? "Existing active budget found during refresh; skipped creation"
                              : outcome === "unavailable"
                                ? "Category changed or was removed; skipped creation"
                                : "Save outcome uncertain. Reconcile before retrying; this budget may already be saved."}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
      {planningError || error ? (
        <p role="alert" className="text-sm text-destructive">
          {planningError || error}
        </p>
      ) : null}
      {invalidAmounts ? (
        <p role="alert" className="text-sm text-destructive">
          Enter a positive, finite limit for every selected category.
        </p>
      ) : null}
      {Object.keys(outcomes).length ? (
        <p role="status" className="text-sm">
          {confirmed} confirmed · {reconciled} reconciled · {skipped} skipped.
          Each budget is saved separately; a stopped batch can leave partial
          saves.
        </p>
      ) : null}
      {!loading && !history ? (
        <Button variant="outline" onClick={reloadHistory}>
          Retry loading history
        </Button>
      ) : null}
      {history ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              busy ||
              loading ||
              !selected.length ||
              invalidAmounts ||
              !!planningError
            }
            onClick={save}
          >
            {busy
              ? "Saving…"
              : error
                ? "Reconcile and retry"
                : "Create selected budgets"}
          </Button>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={async () => {
              resetPlanning();
              await reloadHistory();
            }}
          >
            Reload proposals
          </Button>
        </div>
      ) : null}
      <ActionToast toast={toast} />
    </div>
  );
}
