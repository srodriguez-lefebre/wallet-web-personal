import { FormEvent, useState } from "react";
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
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
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
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import { calculateGoalProgress, formatMoney } from "@shared/calculations";
import type { CurrencyCode, Goal, GoalStatus } from "@shared/types";

interface GoalDraft {
  id: string;
  name: string;
  targetAmount: string;
  currency: CurrencyCode;
  color: string;
  isVisible: boolean;
  tagId: string;
  deadline: string;
  status: GoalStatus;
  accountId: string;
  note: string;
  isDeleted: boolean;
}

const goalStatusOptions: Array<{ value: GoalStatus; label: string }> = [
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

function buildGoalDrafts(goals: Goal[]): GoalDraft[] {
  return goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetAmount: String(goal.targetAmount),
    currency: goal.currency,
    color: goal.color,
    isVisible: goal.isVisible,
    tagId: goal.tagIds[0] ?? "",
    deadline: goal.deadline ?? "",
    status: goal.status,
    accountId: goal.accountId ?? "",
    note: goal.note ?? "",
    isDeleted: false,
  }));
}

export function GoalsView() {
  const navigate = useNavigate();
  const {
    dataset,
    addGoal,
    updateGoal,
    deleteGoal,
    addGoalReservation,
    setRecordFilters,
  } = useWallet();
  const [showHidden, setShowHidden] = useState(false);
  const goals = calculateGoalProgress(dataset);
  const visibleGoals = goals.filter((item) => item.goal.isVisible);
  const [goalId, setGoalId] = useState(dataset.goals[0]?.id ?? "");
  const [accountId, setAccountId] = useState(dataset.accounts[0]?.id ?? "");
  const [reserveAmount, setReserveAmount] = useState("");
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [color, setColor] = useState("#2563EB");
  const [tagId, setTagId] = useState(dataset.tags[0]?.id ?? "");
  const [deadline, setDeadline] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>(() =>
    buildGoalDrafts(dataset.goals),
  );
  const visibleGoalDrafts = goalDrafts.filter(
    (draft) => !draft.isDeleted && (showHidden || draft.isVisible),
  );
  const inputClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const textareaClassName =
    "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const colorInputClassName =
    "h-10 w-10 cursor-pointer rounded-full border bg-background p-1 [appearance:none] [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0";

  function startEditingGoals() {
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

  function saveGoalEdits() {
    const activeDrafts = goalDrafts.filter((draft) => !draft.isDeleted);
    const invalidDraft = activeDrafts.find(
      (draft) => !draft.name.trim() || Number(draft.targetAmount) <= 0,
    );

    if (invalidDraft) {
      setEditError("Revisa que cada objetivo tenga nombre y monto mayor a 0.");
      return;
    }

    goalDrafts
      .filter((draft) => draft.isDeleted)
      .forEach((draft) => deleteGoal(draft.id));

    activeDrafts.forEach((draft) => {
      const currentGoal = dataset.goals.find((goal) => goal.id === draft.id);
      if (!currentGoal) return;

      updateGoal(draft.id, {
        name: draft.name.trim(),
        targetAmount: Number(draft.targetAmount),
        currency: draft.currency,
        color: draft.color,
        isVisible: draft.isVisible,
        icon: currentGoal.icon,
        deadline: draft.deadline || undefined,
        status: draft.status,
        tagIds: draft.tagId ? [draft.tagId] : [],
        accountId: draft.accountId || undefined,
        note: draft.note.trim() || undefined,
      });
    });

    const selectedDraft = goalDrafts.find((draft) => draft.id === goalId);
    if (!selectedDraft || selectedDraft.isDeleted || !selectedDraft.isVisible) {
      setGoalId(activeDrafts.find((draft) => draft.isVisible)?.id ?? "");
    }

    setShowHidden(false);
    setEditError("");
    setIsEditing(false);
  }

  function handleCreateGoal(event: FormEvent) {
    event.preventDefault();
    const numericTarget = Number(targetAmount);
    if (!name.trim() || numericTarget <= 0) return;

    const id = addGoal({
      name: name.trim(),
      targetAmount: numericTarget,
      currency,
      color,
      icon: "flag",
      isVisible: true,
      deadline: deadline || undefined,
      status: "active",
      tagIds: tagId ? [tagId] : [],
      accountId,
      note: undefined,
    });

    setName("");
    setTargetAmount("");
    setDeadline("");
    setIsCreateOpen(false);
    navigate(`/goals/${id}`);
  }

  function handleReserve(event: FormEvent) {
    event.preventDefault();
    const account = dataset.accounts.find((item) => item.id === accountId);
    const numericAmount = Number(reserveAmount);
    if (!account || !goalId || numericAmount <= 0) return;

    addGoalReservation({
      goalId,
      accountId,
      amount: numericAmount,
      currency: account.currency,
      createdAt: new Date().toISOString(),
      note: "Reserva manual",
    });
    setReserveAmount("");
  }

  function openGoalRecords(tag?: string) {
    setRecordFilters({ type: "expense", tagId: tag });
    navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Goals"
        title="Objetivos"
        description="Crea objetivos, reserva dinero y entra al detalle para ver contexto asociado."
      >
        {isEditing ? (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label={showHidden ? "Ocultar objetivos ocultos" : "Ver objetivos ocultos"}
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
            <Button variant="outline" onClick={cancelEditingGoals}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={saveGoalEdits}>
              <Save className="h-4 w-4" />
              Guardar
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label="Editar objetivos"
              disabled={dataset.goals.length === 0}
              onClick={startEditingGoals}
            >
              <Edit3 className="h-5 w-5" />
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" aria-label="Nuevo objetivo">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo objetivo</DialogTitle>
                  <DialogDescription>
                    Defini la meta, elegi color y conectala con una etiqueta.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreateGoal}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Nombre</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                      placeholder="Viaje, emergencia, notebook..."
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Objetivo</span>
                      <input
                        value={targetAmount}
                        onChange={(event) => setTargetAmount(event.target.value)}
                        type="number"
                        className={inputClassName}
                        placeholder="50000"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Moneda</span>
                      <select
                        value={currency}
                        onChange={(event) =>
                          setCurrency(event.target.value as CurrencyCode)
                        }
                        className={inputClassName}
                      >
                        <option value="UYU">UYU</option>
                        <option value="USD">USD</option>
                        <option value="BRL">BRL</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Etiqueta</span>
                      <select
                        value={tagId}
                        onChange={(event) => setTagId(event.target.value)}
                        className={inputClassName}
                      >
                        <option value="">Sin etiqueta</option>
                        {dataset.tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Color</span>
                      <input
                        value={color}
                        onChange={(event) => setColor(event.target.value)}
                        type="color"
                        className={colorInputClassName}
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Fecha limite</span>
                    <input
                      value={deadline}
                      onChange={(event) => setDeadline(event.target.value)}
                      type="date"
                      className={inputClassName}
                    />
                  </label>
                  <Button className="w-full" type="submit">
                    <Plus className="h-4 w-4" />
                    Crear y abrir detalle
                  </Button>
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
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-1 items-start gap-3">
                        <label className="block space-y-2">
                          <span className="sr-only">Color</span>
                          <input
                            value={draft.color}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, { color: event.target.value })
                            }
                            type="color"
                            className={colorInputClassName}
                            aria-label={`Color de ${draft.name || "objetivo"}`}
                          />
                        </label>
                        <label className="block flex-1 space-y-2">
                          <span className="text-sm font-medium">Nombre</span>
                          <input
                            value={draft.name}
                            onChange={(event) =>
                              updateGoalDraft(draft.id, { name: event.target.value })
                            }
                            className={inputClassName}
                            placeholder="Nombre del objetivo"
                          />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={draft.isVisible ? "Ocultar objetivo" : "Mostrar objetivo"}
                          title={draft.isVisible ? "Ocultar objetivo" : "Mostrar objetivo"}
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
                          aria-label="Eliminar objetivo"
                          title="Eliminar objetivo"
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
                        <span className="text-sm font-medium">Objetivo</span>
                        <input
                          value={draft.targetAmount}
                          onChange={(event) =>
                            updateGoalDraft(draft.id, {
                              targetAmount: event.target.value,
                            })
                          }
                          type="number"
                          className={inputClassName}
                          placeholder="50000"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Estado</span>
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
                        <span className="text-sm font-medium">Moneda</span>
                        <select
                          value={draft.currency}
                          onChange={(event) =>
                            updateGoalDraft(draft.id, {
                              currency: event.target.value as CurrencyCode,
                            })
                          }
                          className={inputClassName}
                        >
                          <option value="UYU">UYU</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="BRL">BRL</option>
                          <option value="ARS">ARS</option>
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Fecha limite</span>
                        <input
                          value={draft.deadline}
                          onChange={(event) =>
                            updateGoalDraft(draft.id, { deadline: event.target.value })
                          }
                          type="date"
                          className={inputClassName}
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Etiqueta asociada</span>
                        <select
                          value={draft.tagId}
                          onChange={(event) =>
                            updateGoalDraft(draft.id, { tagId: event.target.value })
                          }
                          className={inputClassName}
                        >
                          <option value="">Sin etiqueta</option>
                          {dataset.tags.map((tag) => (
                            <option key={tag.id} value={tag.id}>
                              {tag.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Cuenta asociada</span>
                        <select
                          value={draft.accountId}
                          onChange={(event) =>
                            updateGoalDraft(draft.id, { accountId: event.target.value })
                          }
                          className={inputClassName}
                        >
                          <option value="">Sin cuenta</option>
                          {dataset.accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Nota</span>
                      <textarea
                        value={draft.note}
                        onChange={(event) =>
                          updateGoalDraft(draft.id, { note: event.target.value })
                        }
                        className={textareaClassName}
                        placeholder="Contexto o descripcion del objetivo"
                      />
                    </label>
                  </CardContent>
                </Card>
              ))}
              {visibleGoalDrafts.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    No quedan objetivos en edicion.
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
                onClick={() => navigate(`/goals/${item.goal.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/goals/${item.goal.id}`);
                  }
                }}
                className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-9 w-9 place-items-center rounded-md text-white"
                        style={{ backgroundColor: item.goal.color }}
                      >
                        <Flag className="h-4 w-4" />
                      </span>
                      <div>
                        <CardTitle>{item.goal.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Objetivo{" "}
                          {formatMoney(item.goal.targetAmount, item.goal.currency)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={item.goal.status === "active" ? "success" : "muted"}>
                      {item.goal.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress value={item.percentage} indicatorClassName="bg-sky-500" />
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-muted-foreground">Reservado</p>
                      <p className="font-semibold">
                        {formatMoney(item.reserved, item.goal.currency)}
                      </p>
                    </div>
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-muted-foreground">Gastado</p>
                      <p className="font-semibold">
                        {formatMoney(item.spent, item.goal.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.goal.tagIds.map((currentTagId) => {
                      const tag = dataset.tags.find(
                        (candidate) => candidate.id === currentTagId,
                      );
                      return tag ? (
                        <Badge
                          key={tag.id}
                          variant="info"
                          className="transition hover:bg-sky-500/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            openGoalRecords(tag.id);
                          }}
                        >
                          {tag.name}
                        </Badge>
                      ) : null;
                    })}
                    {item.goal.deadline ? (
                      <Badge variant="muted">
                        <CalendarDays className="mr-1 h-3 w-3" />
                        {item.goal.deadline}
                      </Badge>
                    ) : null}
                    {!item.goal.isVisible ? (
                      <Badge variant="muted">
                        <EyeOff className="mr-1 h-3 w-3" />
                        Oculto
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
              <CardContent className="py-4 text-sm text-destructive">
                {editError}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4" />
                Reservar dinero
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleReserve}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Goal</span>
                  <select
                    value={goalId}
                    onChange={(event) => setGoalId(event.target.value)}
                    className={inputClassName}
                  >
                    {dataset.goals
                      .filter((goal) => goal.isVisible)
                      .map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Cuenta</span>
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
                  <span className="text-sm font-medium">Monto</span>
                  <input
                    value={reserveAmount}
                    onChange={(event) => setReserveAmount(event.target.value)}
                    type="number"
                    className={inputClassName}
                    placeholder="0"
                  />
                </label>
                <Button className="w-full" type="submit">
                  <Plus className="h-4 w-4" />
                  Reservar
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
