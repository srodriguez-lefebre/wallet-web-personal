import { ArrowLeft, CalendarDays, Flag, PiggyBank, ReceiptText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import { calculateGoalProgress, formatMoney } from "@shared/calculations";

export function GoalDetailView() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { dataset, setRecordFilters } = useWallet();
  const progress = calculateGoalProgress(dataset).find(
    (item) => item.goal.id === goalId,
  );

  if (!progress) {
    return (
      <div>
        <PageHeader title="Goal no encontrado" description="El objetivo no existe." />
        <Button variant="outline" onClick={() => navigate("/goals")}>
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
      </div>
    );
  }

  const goalProgress = progress;
  const linkedRecords = dataset.records
    .filter((record) =>
      record.tagIds.some((tagId) => goalProgress.goal.tagIds.includes(tagId)),
    )
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  const reservations = dataset.goalReservations.filter(
    (reservation) => reservation.goalId === goalProgress.goal.id,
  );

  function openRecords() {
    setRecordFilters({
      type: "expense",
      tagId: goalProgress.goal.tagIds[0],
    });
    navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Goal detail"
        title={goalProgress.goal.name}
        description="Detalle del objetivo, dinero reservado y movimientos vinculados por etiquetas."
      >
        <Button variant="outline" onClick={() => navigate("/goals")}>
          <ArrowLeft className="h-4 w-4" />
          Goals
        </Button>
        <Button onClick={openRecords}>
          <ReceiptText className="h-4 w-4" />
          Ver records
        </Button>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-12 w-12 place-items-center rounded-lg text-white"
                    style={{ backgroundColor: goalProgress.goal.color }}
                  >
                    <Flag className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle>{goalProgress.goal.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Objetivo {formatMoney(goalProgress.goal.targetAmount, goalProgress.goal.currency)}
                    </p>
                  </div>
                </div>
                <Badge variant={goalProgress.goal.status === "active" ? "success" : "muted"}>
                  {goalProgress.goal.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={goalProgress.percentage} indicatorClassName="bg-sky-500" />
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Reservado</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.reserved, goalProgress.goal.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Gastado</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.spent, goalProgress.goal.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Comprometido</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.committed, goalProgress.goal.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Restante</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.remaining, goalProgress.goal.currency)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {goalProgress.goal.tagIds.map((tagId) => {
                  const tag = dataset.tags.find((candidate) => candidate.id === tagId);
                  return tag ? (
                    <Badge key={tag.id} variant="info">
                      {tag.name}
                    </Badge>
                  ) : null;
                })}
                {goalProgress.goal.deadline ? (
                  <Badge variant="muted">
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {goalProgress.goal.deadline}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Movimientos asociados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavia no hay movimientos asociados a este objetivo.
                </p>
              ) : (
                linkedRecords.map((record) => {
                  const category = dataset.categories.find(
                    (item) => item.id === record.categoryId,
                  );
                  const account = dataset.accounts.find(
                    (item) => item.id === record.accountId,
                  );
                  return (
                    <button
                      key={record.id}
                      type="button"
                      onClick={openRecords}
                      className="flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                    >
                      <div>
                        <p className="font-medium">{category?.name ?? "Transferencia"}</p>
                        <p className="text-xs text-muted-foreground">
                          {account?.name} · {record.note ?? "Sin nota"}
                        </p>
                      </div>
                      <p
                        className={
                          record.type === "expense"
                            ? "font-semibold text-red-600"
                            : "font-semibold text-emerald-600"
                        }
                      >
                        {record.type === "expense" ? "-" : "+"}
                        {formatMoney(record.amount, record.currency)}
                      </p>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Reservas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavia no reservaste dinero para este objetivo.
              </p>
            ) : (
              reservations.map((reservation) => {
                const account = dataset.accounts.find(
                  (item) => item.id === reservation.accountId,
                );
                return (
                  <div key={reservation.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{account?.name ?? "Cuenta"}</p>
                        <p className="text-xs text-muted-foreground">
                          {reservation.note ?? "Reserva"}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatMoney(reservation.amount, reservation.currency)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
