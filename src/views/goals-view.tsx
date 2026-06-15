import { FormEvent, useState } from "react";
import { CalendarDays, Edit3, Flag, PiggyBank, Plus, Trash2 } from "lucide-react";
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
import type { CurrencyCode, GoalStatus } from "@shared/types";

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
  const goals = calculateGoalProgress(dataset);
  const firstGoal = dataset.goals[0];
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editGoalId, setEditGoalId] = useState(firstGoal?.id ?? "");
  const [editName, setEditName] = useState(firstGoal?.name ?? "");
  const [editTargetAmount, setEditTargetAmount] = useState(
    firstGoal ? String(firstGoal.targetAmount) : "",
  );
  const [editCurrency, setEditCurrency] = useState<CurrencyCode>(
    firstGoal?.currency ?? "UYU",
  );
  const [editColor, setEditColor] = useState(firstGoal?.color ?? "#2563EB");
  const [editTagId, setEditTagId] = useState(firstGoal?.tagIds[0] ?? "");
  const [editDeadline, setEditDeadline] = useState(firstGoal?.deadline ?? "");
  const [editStatus, setEditStatus] = useState<GoalStatus>(
    firstGoal?.status ?? "active",
  );
  const [editAccountId, setEditAccountId] = useState(firstGoal?.accountId ?? "");
  const [editNote, setEditNote] = useState(firstGoal?.note ?? "");

  function loadEditableGoal(nextGoalId: string) {
    const goal = dataset.goals.find((item) => item.id === nextGoalId);
    if (!goal) return;

    setEditGoalId(goal.id);
    setEditName(goal.name);
    setEditTargetAmount(String(goal.targetAmount));
    setEditCurrency(goal.currency);
    setEditColor(goal.color);
    setEditTagId(goal.tagIds[0] ?? "");
    setEditDeadline(goal.deadline ?? "");
    setEditStatus(goal.status);
    setEditAccountId(goal.accountId ?? "");
    setEditNote(goal.note ?? "");
  }

  function openEditDialog() {
    const nextGoalId =
      dataset.goals.find((goal) => goal.id === editGoalId)?.id ??
      dataset.goals[0]?.id ??
      "";

    if (nextGoalId) {
      loadEditableGoal(nextGoalId);
    }

    setIsEditOpen(true);
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

  function handleUpdateGoal(event: FormEvent) {
    event.preventDefault();
    const currentGoal = dataset.goals.find((goal) => goal.id === editGoalId);
    const numericTarget = Number(editTargetAmount);
    if (!currentGoal || !editName.trim() || numericTarget <= 0) return;

    updateGoal(editGoalId, {
      name: editName.trim(),
      targetAmount: numericTarget,
      currency: editCurrency,
      color: editColor,
      icon: currentGoal.icon,
      deadline: editDeadline || undefined,
      status: editStatus,
      tagIds: editTagId ? [editTagId] : [],
      accountId: editAccountId || undefined,
      note: editNote.trim() || undefined,
    });

    setIsEditOpen(false);
  }

  function handleDeleteGoal() {
    const currentGoal = dataset.goals.find((goal) => goal.id === editGoalId);
    if (!currentGoal) return;

    const shouldDelete = window.confirm(`Eliminar el objetivo "${currentGoal.name}"?`);
    if (!shouldDelete) return;

    const nextGoal = dataset.goals.find((goal) => goal.id !== currentGoal.id);
    deleteGoal(currentGoal.id);
    setGoalId(nextGoal?.id ?? "");
    if (nextGoal) {
      loadEditableGoal(nextGoal.id);
    } else {
      setEditGoalId("");
      setEditName("");
      setEditTargetAmount("");
      setEditCurrency("UYU");
      setEditColor("#2563EB");
      setEditTagId("");
      setEditDeadline("");
      setEditStatus("active");
      setEditAccountId("");
      setEditNote("");
    }
    setIsEditOpen(false);
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
        <Button
          size="icon"
          variant="outline"
          aria-label="Editar objetivo"
          disabled={dataset.goals.length === 0}
          onClick={openEditDialog}
        >
          <Edit3 className="h-5 w-5" />
        </Button>
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar objetivo</DialogTitle>
              <DialogDescription>
                Ajusta el nombre, monto, estado, color y relaciones del objetivo.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleUpdateGoal}>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Objetivo a editar</span>
                <select
                  value={editGoalId}
                  onChange={(event) => loadEditableGoal(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {dataset.goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Nombre</span>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Viaje, emergencia, notebook..."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Objetivo</span>
                  <input
                    value={editTargetAmount}
                    onChange={(event) => setEditTargetAmount(event.target.value)}
                    type="number"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="50000"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Estado</span>
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as GoalStatus)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="active">Activo</option>
                    <option value="paused">Pausado</option>
                    <option value="completed">Completado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Moneda</span>
                  <select
                    value={editCurrency}
                    onChange={(event) => setEditCurrency(event.target.value as CurrencyCode)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="BRL">BRL</option>
                    <option value="ARS">ARS</option>
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Color</span>
                  <input
                    value={editColor}
                    onChange={(event) => setEditColor(event.target.value)}
                    type="color"
                    className="h-10 w-full rounded-md border bg-background px-2"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Etiqueta asociada</span>
                  <select
                    value={editTagId}
                    onChange={(event) => setEditTagId(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    value={editAccountId}
                    onChange={(event) => setEditAccountId(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                <span className="text-sm font-medium">Fecha limite</span>
                <input
                  value={editDeadline}
                  onChange={(event) => setEditDeadline(event.target.value)}
                  type="date"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Nota</span>
                <textarea
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Contexto o descripcion del objetivo"
                />
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteGoal}
                  disabled={!editGoalId}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
                <Button type="submit" disabled={!editGoalId}>
                  <Edit3 className="h-4 w-4" />
                  Guardar cambios
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="50000"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Moneda</span>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    className="h-10 w-full rounded-md border bg-background px-2"
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Fecha limite</span>
                <input
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  type="date"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <Button className="w-full" type="submit">
                <Plus className="h-4 w-4" />
                Crear y abrir detalle
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((item) => (
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
                        Objetivo {formatMoney(item.goal.targetAmount, item.goal.currency)}
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
                    const tag = dataset.tags.find((candidate) => candidate.id === currentTagId);
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
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
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {dataset.goals.map((goal) => (
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
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
