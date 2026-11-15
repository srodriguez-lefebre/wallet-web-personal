import { currencySchema } from "@shared/schemas";
import { formatMoney } from "@shared/calculations";
import { goalStatusLabels } from "@shared/constants";
import {
  CalendarDays,
  Edit3,
  Eye,
  EyeOff,
  Flag,
  PiggyBank,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ActionToastOptions } from "@/lib/action-toast-runner";
import type { CurrencyCode, Goal, GoalStatus } from "@shared/types";

import {
  controlClassName as inputClassName,
  textareaClassName,
  colorControlClassName as colorInputClassName,
  Input,
  ColorInput,
  DateInput,
} from "@/components/ui/form/controls";
import { readableForeground } from "@/lib/palette";
import { useDraftFields } from "@/hooks/use-draft-fields";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { ConfirmDialog } from "@/components/ui/form/dialogs";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import { historicalGoalPatches } from "@/lib/historical-goals";
import { PageHeader } from "@/components/page/page-header";
import { ReadState } from "@/components/page/read-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GoalFundingPlan } from "@/components/wallet/goal-funding-plan";
import { GoalProgressBar } from "@/components/wallet/goal-progress-bar";
import { useAccounts, useGoals } from "@/hooks/wallet-entities";
import { finishAction } from "@/lib/async-event";
import { commitDraftRows, draftBaseline } from "@/lib/draft-list";
import { buildGoalUpdatePayload } from "@/lib/goal-update";
import { formatCalendarDate, limitDecimalPlaces } from "@/lib/utils";
import { useWallet } from "@/providers/wallet-provider";

interface GoalDraft {
  id: string;
  name: string;
  targetAmount: string;
  currency: CurrencyCode;
  color: string;
  isVisible: boolean;
  deadline: string;
  status: GoalStatus;
  accountId: string;
  note: string;
  autoCaptureEnabled: boolean;
  autoCaptureStart: string;
  autoCaptureEnd: string;
  autoReservationAccountId: string;
  isDeleted: boolean;
}

const goalStatusOptions: Array<{ value: GoalStatus; label: string }> = [
  { value: "active", label: goalStatusLabels.active },
  { value: "paused", label: goalStatusLabels.paused },
  { value: "completed", label: goalStatusLabels.completed },
  { value: "cancelled", label: goalStatusLabels.cancelled },
];

function buildGoalDrafts(goals: Goal[]): GoalDraft[] {
  return goals.map((goal) => ({
    id: goal.id,
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
    isDeleted: false,
  }));
}

export function GoalsView() {
  const savedDrafts = useRef(new Map<string, string>());
  const working = useRef(false);
  const [isWorking, setIsWorking] = useState(false);
  const { confirm, confirmationProps, isActive } = useConfirmDialog();
  const { toast, runAction } = useActionToast();
  const navigate = useNavigate();
  const {
    dataset,
    addGoal,
    updateGoal,
    updateRecord,
    deleteGoal,
    addGoalReservation,
    getCompleteDataset,
  } = useWallet();
  const [showHidden, setShowHidden] = useState(false);
  const goalReads = useGoals();
  const accountReads = useAccounts();
  const goals = goalReads.progress;
  const visibleGoals = goals.filter((item) => item.goal.isVisible);
  const [
    { preferredGoalId, accountId, reserveAmount },
    { preferredGoalId: setGoalId, accountId: setAccountId, reserveAmount: setReserveAmount },
  ] = useDraftFields(() => ({
    preferredGoalId: "",
    accountId: dataset.accounts[0]?.id ?? "",
    reserveAmount: "",
  }));
  const reservationGoals = dataset.goals.filter(
    (goal) => goal.isVisible && goal.status === "active",
  );
  const goalId = preferredGoalId
    ? (reservationGoals.find((goal) => goal.id === preferredGoalId)?.id ?? "")
    : (reservationGoals[0]?.id ?? "");

  const [
    { name, targetAmount, currency, color, deadline },
    {
      name: setName,
      targetAmount: setTargetAmount,
      currency: setCurrency,
      color: setColor,
      deadline: setDeadline,
    },
  ] = useDraftFields<{
    name: string;
    targetAmount: string;
    currency: CurrencyCode;
    color: string;
    deadline: string;
  }>(() => ({
    name: "",
    targetAmount: "",
    currency: "UYU",
    color: "#2563EB",
    deadline: "",
  }));

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>(() => buildGoalDrafts(dataset.goals));
  const visibleGoalDrafts = goalDrafts.filter(
    (draft) => !draft.isDeleted && (showHidden || draft.isVisible),
  );

  function startEditingGoals() {
    savedDrafts.current = draftBaseline(buildGoalDrafts(dataset.goals));
    setGoalDrafts(buildGoalDrafts(dataset.goals));
    setShowHidden(false);
    setEditError("");
    setIsEditing(true);
  }

  function cancelEditingGoals() {
    setGoalDrafts(buildGoalDrafts(dataset.goals));
    setShowHidden(false);
    setEditError("");
    setIsEditing(false);
  }

  function updateGoalDraft(goalIdToUpdate: string, patch: Partial<GoalDraft>) {
    setGoalDrafts((current) =>
      current.map((draft) =>
        draft.id === goalIdToUpdate
          ? {
              ...draft,
              ...patch,
            }
          : draft,
      ),
    );
  }

  function markGoalForDeletion(goalIdToDelete: string) {
    setGoalDrafts((current) =>
      current.map((draft) =>
        draft.id === goalIdToDelete
          ? {
              ...draft,
              isDeleted: true,
            }
          : draft,
      ),
    );
  }

  async function performGoalAction<T>(work: () => Promise<T>, options: ActionToastOptions) {
    if (working.current) return;
    working.current = true;
    setIsWorking(true);
    setEditError("");
    try {
      const result = await runAction(work, options);
      if (!result.ok) setEditError(result.error.message);
      return result;
    } finally {
      working.current = false;
      setIsWorking(false);
    }
  }
  async function saveGoalEdits() {
    await performGoalAction(saveGoalDrafts, {
      processing: "Saving goals...",
      success: "Goals saved",
      error: "Could not save goals",
    });
  }
  async function saveGoalDrafts() {
    const activeDrafts = goalDrafts.filter((draft) => !draft.isDeleted);
    const invalidDraft = activeDrafts.find(
      (draft) =>
        !draft.name.trim() ||
        Number(draft.targetAmount) <= 0 ||
        (draft.autoCaptureEnabled &&
          (!draft.autoCaptureStart ||
            !draft.autoCaptureEnd ||
            draft.autoCaptureStart > draft.autoCaptureEnd)),
    );

    if (invalidDraft) {
      throw new Error("Make sure every goal has a name and an amount greater than zero.");
    }

    const needsHistory = activeDrafts.some(
      (draft) =>
        draft.autoCaptureEnabled &&
        draft.autoCaptureStart &&
        draft.autoCaptureStart <= new Date().toISOString().slice(0, 10),
    );
    const historyRecords = needsHistory ? (await getCompleteDataset()).records : [];
    const historicalAssociations: Array<{ goalId: string; recordIds: string[] }> = [];
    for (const draft of activeDrafts) {
      if (
        !draft.autoCaptureEnabled ||
        !draft.autoCaptureStart ||
        draft.autoCaptureStart > new Date().toISOString().slice(0, 10)
      )
        continue;
      const recordIds = historyRecords
        .filter(
          (record) =>
            record.type === "expense" &&
            record.paymentStatus !== "cancelled" &&
            record.occurredAt.slice(0, 10) >= draft.autoCaptureStart &&
            record.occurredAt.slice(0, 10) <= draft.autoCaptureEnd &&
            !(record.goalIds ?? []).includes(draft.id),
        )
        .map((record) => record.id);
      if (
        recordIds.length &&
        (await confirm({
          title: "Associate historical expenses?",
          description: `${recordIds.length} historical expenses match ${draft.name}. Associate them now?`,
          confirmLabel: "Associate expenses",
        }))
      )
        historicalAssociations.push({ goalId: draft.id, recordIds });
    }

    for (const { id, patch } of historicalGoalPatches(historyRecords, historicalAssociations)) {
      if (!isActive()) return;
      await updateRecord(id, patch);
    }

    await commitDraftRows(goalDrafts, savedDrafts.current, async (draft) => {
      if (!isActive()) throw new DOMException("Goal view closed", "AbortError");
      if (draft.isDeleted) return deleteGoal(draft.id);
      const currentGoal = dataset.goals.find((goal) => goal.id === draft.id);
      if (!currentGoal) throw new Error("Goal no longer available. Reload before continuing.");

      return updateGoal(draft.id, buildGoalUpdatePayload(draft, currentGoal.icon));
    });

    const selectedDraft = goalDrafts.find((draft) => draft.id === goalId);
    if (!selectedDraft || selectedDraft.isDeleted || !selectedDraft.isVisible) {
      setGoalId(activeDrafts.find((draft) => draft.isVisible)?.id ?? "");
    }

    setShowHidden(false);
    setEditError("");
    setIsEditing(false);
  }

  async function handleCreateGoal(event: FormEvent) {
    event.preventDefault();
    const numericTarget = Number(targetAmount);
    if (!name.trim() || numericTarget <= 0) return;

    const result = await performGoalAction(
      () =>
        addGoal({
          name: name.trim(),
          targetAmount: numericTarget,
          currency,
          color,
          icon: "flag",
          isVisible: true,
          deadline: deadline || undefined,
          status: "active",
          accountId,
          autoCaptureEnabled: false,
          autoCaptureStart: undefined,
          autoCaptureEnd: undefined,
          autoReservationAccountId: accountId || undefined,
          note: undefined,
        }),
      { processing: "Creating goal...", success: "Goal created", error: "Could not create goal" },
    );
    if (!result?.ok || !isActive()) return;
    const id = result.value;

    setName("");
    setTargetAmount("");
    setDeadline("");
    setIsCreateOpen(false);
    void navigate(`/goals/${id}`);
  }

  async function handleReserve(event: FormEvent) {
    event.preventDefault();
    const account = dataset.accounts.find((item) => item.id === accountId);
    const numericAmount = Number(reserveAmount);
    if (!account || !goalId || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    const balance = accountReads.balances.find((item) => item.account.id === accountId);
    if (
      balance &&
      numericAmount > balance.freeBalance &&
      !(await confirm({
        title: "Reserve more than the available balance?",
        description: `The available balance is ${formatMoney(balance.freeBalance, account.currency)}. Continue with this reservation?`,
        confirmLabel: "Reserve funds",
      }))
    )
      return;

    const result = await performGoalAction(
      () =>
        addGoalReservation({
          goalId,
          accountId,
          amount: numericAmount,
          currency: account.currency,
          createdAt: new Date().toISOString(),
          note: "Reserva manual",
        }),
      {
        processing: "Reserving funds...",
        success: "Funds reserved",
        error: "Could not reserve funds",
      },
    );
    if (result?.ok) setReserveAmount("");
  }

  if (goalReads.metrics.data === undefined)
    return <ReadState label="goals" error={goalReads.isError} />;
  return (
    <div>
      <ActionToast toast={toast} />
      <ConfirmDialog {...confirmationProps} />
      {editError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {editError}
        </p>
      )}
      <PageHeader
        eyebrow="Goals"
        title="Goals"
        description="Create goals, reserve money, and open details for related context."
      >
        {isEditing ? (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label={showHidden ? "Hide hidden goals" : "Show hidden goals"}
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
            <Button variant="outline" disabled={isWorking} onClick={cancelEditingGoals}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              disabled={isWorking}
              onClick={() => {
                finishAction(saveGoalEdits());
              }}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label="Edit goals"
              disabled={dataset.goals.length === 0}
              onClick={startEditingGoals}
            >
              <Edit3 className="h-5 w-5" />
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" aria-label="New goal">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New goal</DialogTitle>
                  <DialogDescription>
                    Set the target, choose a color, and connect it to a tag.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    finishAction(handleCreateGoal(event));
                  }}
                >
                  <fieldset disabled={isWorking} className="contents">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Name</span>
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className={inputClassName}
                        placeholder="Viaje, emergencia, notebook..."
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Target</span>
                        <Input
                          value={targetAmount}
                          onChange={(event) =>
                            setTargetAmount(limitDecimalPlaces(event.target.value))
                          }
                          type="number"
                          className={inputClassName}
                          placeholder="50000"
                          step="0.01"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Currency</span>
                        <select
                          value={currency}
                          onChange={(event) =>
                            setCurrency(currencySchema.parse(event.target.value))
                          }
                          className={inputClassName}
                        >
                          {currencySchema.options.map((currencyOption) => (
                            <option key={currencyOption} value={currencyOption}>
                              {currencyOption}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Color</span>
                        <ColorInput
                          value={color}
                          onChange={(event) => setColor(event.target.value)}
                          className={colorInputClassName}
                        />
                      </label>
                    </div>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Deadline</span>
                      <DateInput
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                        className={inputClassName}
                      />
                    </label>
                    <Button className="w-full" type="submit" disabled={isWorking}>
                      <Plus className="h-4 w-4" />
                      Crear y abrir detalle
                    </Button>
                  </fieldset>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {isEditing ? (
            <>
              {visibleGoalDrafts.map((draft) => (
                <Card key={draft.id} className="border-primary/30 shadow-sm">
                  <fieldset disabled={isWorking} className="contents">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-1 items-start gap-3">
                          <label className="block space-y-2">
                            <span className="sr-only">Color</span>
                            <ColorInput
                              value={draft.color}
                              onChange={(event) =>
                                updateGoalDraft(draft.id, {
                                  color: event.target.value,
                                })
                              }
                              className={colorInputClassName}
                              aria-label={`${draft.name || "Goal"} color`}
                            />
                          </label>
                          <label className="block flex-1 space-y-2">
                            <span className="text-sm font-medium">Name</span>
                            <Input
                              value={draft.name}
                              onChange={(event) =>
                                updateGoalDraft(draft.id, {
                                  name: event.target.value,
                                })
                              }
                              className={inputClassName}
                              placeholder="Goal name"
                            />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={draft.isVisible ? "Hide goal" : "Show goal"}
                            title={draft.isVisible ? "Hide goal" : "Show goal"}
                            onClick={() =>
                              updateGoalDraft(draft.id, {
                                isVisible: !draft.isVisible,
                              })
                            }
                          >
                            {draft.isVisible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            aria-label="Delete goal"
                            title="Delete goal"
                            onClick={() => markGoalForDeletion(draft.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Target</span>
                          <Input
                            value={draft.targetAmount}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, {
                                targetAmount: limitDecimalPlaces(event.target.value),
                              })
                            }
                            type="number"
                            className={inputClassName}
                            placeholder="50000"
                            step="0.01"
                          />
                        </label>
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Status</span>
                          <select
                            value={draft.status}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, {
                                status: event.target.value as GoalStatus,
                              })
                            }
                            className={inputClassName}
                          >
                            {goalStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Currency</span>
                          <select
                            value={draft.currency}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, {
                                currency: event.target.value as CurrencyCode,
                              })
                            }
                            className={inputClassName}
                          >
                            {currencySchema.options.map((currency) => (
                              <option key={currency} value={currency}>
                                {currency}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Deadline</span>
                          <DateInput
                            value={draft.deadline}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, {
                                deadline: event.target.value,
                              })
                            }
                            className={inputClassName}
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Linked account</span>
                          <select
                            value={draft.accountId}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, {
                                accountId: event.target.value,
                              })
                            }
                            className={inputClassName}
                          >
                            <option value="">No account</option>
                            {dataset.accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="rounded-lg border p-4">
                        <label className="flex items-center justify-between gap-3">
                          <span>
                            <span className="block text-sm font-medium">
                              Captura automática de gastos
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Asocia gastos del rango y usa primero la reserva.
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-primary"
                            checked={draft.autoCaptureEnabled}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, {
                                autoCaptureEnabled: event.target.checked,
                              })
                            }
                          />
                        </label>
                        {draft.autoCaptureEnabled ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <label className="space-y-2">
                              <span className="text-sm font-medium">Desde</span>
                              <DateInput
                                className={inputClassName}
                                value={draft.autoCaptureStart}
                                onChange={(event) =>
                                  updateGoalDraft(draft.id, {
                                    autoCaptureStart: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-sm font-medium">Hasta</span>
                              <DateInput
                                className={inputClassName}
                                value={draft.autoCaptureEnd}
                                onChange={(event) =>
                                  updateGoalDraft(draft.id, {
                                    autoCaptureEnd: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-sm font-medium">Account de reserva</span>
                              <select
                                className={inputClassName}
                                value={draft.autoReservationAccountId}
                                onChange={(event) =>
                                  updateGoalDraft(draft.id, {
                                    autoReservationAccountId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Sin fallback</option>
                                {dataset.accounts.map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ) : null}
                      </div>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Note</span>
                        <textarea
                          value={draft.note}
                          onChange={(event) =>
                            updateGoalDraft(draft.id, {
                              note: event.target.value,
                            })
                          }
                          className={textareaClassName}
                          placeholder="Goal context or description"
                        />
                      </label>
                    </CardContent>
                  </fieldset>
                </Card>
              ))}
              {visibleGoalDrafts.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    No goals left in edit mode.
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : (
            visibleGoals.map((item) => (
              <Card
                key={item.goal.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  void navigate(`/goals/${item.goal.id}`);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void navigate(`/goals/${item.goal.id}`);
                  }
                }}
                className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-9 w-9 place-items-center rounded-md text-white"
                        style={{
                          backgroundColor: item.goal.color,
                          color: readableForeground(item.goal.color),
                        }}
                      >
                        <Flag className="h-4 w-4" />
                      </span>
                      <div>
                        <CardTitle>{item.goal.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Target {formatMoney(item.goal.targetAmount, item.goal.currency)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={item.goal.status === "active" ? "success" : "muted"}>
                      {goalStatusLabels[item.goal.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <GoalProgressBar progress={item} />
                  {item.hasMissingExchangeRate ? (
                    <p className="text-sm text-muted-foreground">
                      An exchange rate is needed to calculate these totals.
                    </p>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md bg-secondary p-3">
                          <p className="text-muted-foreground">Reserved</p>
                          <p className="font-semibold">
                            {formatMoney(item.reserved, item.goal.currency)}
                          </p>
                        </div>
                        <div className="rounded-md bg-secondary p-3">
                          <p className="text-muted-foreground">Spent</p>
                          <p className="font-semibold">
                            {formatMoney(item.spent, item.goal.currency)}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  <GoalFundingPlan progress={item} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.goal.autoCaptureEnabled ? (
                      <Badge variant="info">Captura automática</Badge>
                    ) : null}
                    {item.goal.deadline ? (
                      <Badge variant="muted">
                        <CalendarDays className="mr-1 h-3 w-3" />
                        <time dateTime={item.goal.deadline}>
                          {formatCalendarDate(item.goal.deadline)}
                        </time>
                      </Badge>
                    ) : null}
                    {!item.goal.isVisible ? (
                      <Badge variant="muted">
                        <EyeOff className="mr-1 h-3 w-3" />
                        Hidden
                      </Badge>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          {editError ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-4 text-sm text-destructive">{editError}</CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4" />
                Reserve money
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                You can reserve money for active goals. Completing a goal releases its remaining
                reservations back to the original accounts.
              </p>
              {reservationGoals.length === 0 && (
                <p className="mb-4 text-sm font-medium">
                  Create or reopen a visible goal to reserve money.
                </p>
              )}
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  finishAction(handleReserve(event));
                }}
              >
                <fieldset disabled={isWorking} className="contents">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Goal</span>
                    <select
                      value={goalId}
                      disabled={reservationGoals.length === 0}
                      onChange={(event) => setGoalId(event.target.value)}
                      className={inputClassName}
                    >
                      {!goalId && (
                        <option value="" disabled>
                          {reservationGoals.length ? "Choose an active goal" : "No active goals"}
                        </option>
                      )}
                      {reservationGoals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Account</span>
                    <select
                      value={accountId}
                      onChange={(event) => setAccountId(event.target.value)}
                      className={inputClassName}
                    >
                      {dataset.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Amount</span>
                    <Input
                      value={reserveAmount}
                      onChange={(event) => setReserveAmount(limitDecimalPlaces(event.target.value))}
                      type="number"
                      className={inputClassName}
                      placeholder="0"
                      step="0.01"
                    />
                  </label>
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={isWorking || !goalId || !accountId || !(Number(reserveAmount) > 0)}
                  >
                    <Plus className="h-4 w-4" />
                    Reserve
                  </Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
