import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildGoalUpdatePayload,
  type GoalUpdateDraft,
} from "@/lib/goal-update";
import {
  currencySchema,
  goalPatchSchema,
  goalSchema,
  type GoalPatch,
} from "@shared/schemas";
import type { Account, CurrencyCode, Goal } from "@shared/types";

function goalDraft(goal: Goal): GoalUpdateDraft {
  return {
    name: goal.name,
    targetAmount: String(goal.targetAmount),
    currency: goal.currency,
    color: goal.color,
    isVisible: goal.isVisible,
    deadline: goal.deadline?.slice(0, 10) ?? "",
    status: goal.status,
    accountId: goal.accountId ?? "",
    note: goal.note ?? "",
    autoCaptureEnabled: goal.autoCaptureEnabled ?? false,
    autoCaptureStart: goal.autoCaptureStart ?? "",
    autoCaptureEnd: goal.autoCaptureEnd ?? "",
    autoReservationAccountId: goal.autoReservationAccountId ?? "",
  };
}

export function GoalEditDialog({
  goal,
  accounts,
  pending,
  onClose,
  onSave,
}: {
  goal: Goal;
  accounts: Account[];
  pending: boolean;
  onClose: () => void;
  onSave: (patch: GoalPatch) => Promise<boolean>;
}) {
  const [initial] = useState(() => goalDraft(goal));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const change = (patch: Partial<GoalUpdateDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const inputClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const payload = buildGoalUpdatePayload(draft, goal.icon);
    const validation = goalSchema.safeParse(
      Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [
          key,
          value === null ? undefined : value,
        ]),
      ),
    );
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ?? "Check the goal details.",
      );
      return;
    }
    const previous = buildGoalUpdatePayload(initial, goal.icon);
    const changes = Object.fromEntries(
      Object.entries(payload).filter(
        ([key, value]) => value !== previous[key as keyof GoalPatch],
      ),
    );
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    const patch = goalPatchSchema.safeParse(changes);
    if (!patch.success) {
      setError(patch.error.issues[0]?.message ?? "Check the goal details.");
      return;
    }
    setError("");
    await onSave(patch.data);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit goal</DialogTitle>
          <DialogDescription>
            Update the goal details and automatic capture settings.
          </DialogDescription>
        </DialogHeader>
        <form
          aria-label="Edit goal details"
          className="space-y-4"
          onSubmit={submit}
        >
          <fieldset disabled={pending} className="space-y-4">
            <label className="block space-y-1">
              <span>Name</span>
              <input
                aria-label="Goal name"
                className={inputClass}
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span>Target amount</span>
                <input
                  aria-label="Goal target amount"
                  className={inputClass}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.targetAmount}
                  onChange={(event) =>
                    change({ targetAmount: event.target.value })
                  }
                  required
                />
              </label>
              <label className="space-y-1">
                <span>Currency</span>
                <select
                  aria-label="Goal currency"
                  className={inputClass}
                  value={draft.currency}
                  onChange={(event) =>
                    change({ currency: event.target.value as CurrencyCode })
                  }
                >
                  {currencySchema.options.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span>Deadline</span>
                <input
                  aria-label="Goal deadline"
                  className={inputClass}
                  type="date"
                  value={draft.deadline}
                  onChange={(event) => change({ deadline: event.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span>Color</span>
                <input
                  aria-label="Goal color"
                  className={inputClass}
                  type="color"
                  value={draft.color}
                  onChange={(event) => change({ color: event.target.value })}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span>Account</span>
              <select
                aria-label="Goal account"
                className={inputClass}
                value={draft.accountId}
                onChange={(event) => change({ accountId: event.target.value })}
              >
                <option value="">No account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isVisible}
                onChange={(event) =>
                  change({ isVisible: event.target.checked })
                }
              />
              Visible goal
            </label>
            <label className="block space-y-1">
              <span>Note</span>
              <textarea
                aria-label="Goal note"
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={draft.note}
                onChange={(event) => change({ note: event.target.value })}
              />
            </label>
            {goal.status !== "completed" ? (
              <>
                <label className="flex items-center gap-2">
                  <input
                    aria-label="Automatic goal capture"
                    type="checkbox"
                    checked={draft.autoCaptureEnabled}
                    onChange={(event) =>
                      change({ autoCaptureEnabled: event.target.checked })
                    }
                  />
                  Automatically capture expenses in a date range
                </label>
                {draft.autoCaptureEnabled ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span>From</span>
                        <input
                          aria-label="Goal capture from"
                          className={inputClass}
                          type="date"
                          value={draft.autoCaptureStart}
                          onChange={(event) =>
                            change({ autoCaptureStart: event.target.value })
                          }
                        />
                      </label>
                      <label className="space-y-1">
                        <span>Until</span>
                        <input
                          aria-label="Goal capture until"
                          className={inputClass}
                          type="date"
                          value={draft.autoCaptureEnd}
                          onChange={(event) =>
                            change({ autoCaptureEnd: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span>Fallback reservation account</span>
                      <select
                        aria-label="Goal reservation account"
                        className={inputClass}
                        value={draft.autoReservationAccountId}
                        onChange={(event) =>
                          change({
                            autoReservationAccountId: event.target.value,
                          })
                        }
                      >
                        <option value="">No fallback</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </>
            ) : null}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              aria-label="Save goal details"
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
