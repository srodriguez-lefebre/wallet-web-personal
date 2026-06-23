import { ArrowLeft, CalendarDays, Flag, PiggyBank, ReceiptText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import { useWallet } from "@/providers/wallet-provider";
import { calculateGoalProgress, formatMoney } from "@shared/calculations";
import { goalStatusLabels } from "@shared/constants";

export function GoalDetailView() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { dataset, setRecordFilters, releaseGoalReservation } = useWallet();
  const [releaseAmounts, setReleaseAmounts] = useState<Record<string, string>>({});
  const { toast, runAction } = useActionToast();
  const progress = calculateGoalProgress(dataset).find(
    (item) => item.goal.id === goalId,
  );

  if (!progress) {
    return (
      <div>
        <PageHeader title="Goal not found" description="This goal does not exist." />
        <Button variant="outline" onClick={() => navigate("/goals")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  const goalProgress = progress;
  const linkedRecords = dataset.records
    .filter((record) =>
      (record.goalIds ?? []).includes(goalProgress.goal.id),
    )
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  const reservations = dataset.goalReservations.filter(
    (reservation) => reservation.goalId === goalProgress.goal.id,
  );
  const deadlineDays = goalProgress.goal.deadline
    ? differenceInCalendarDays(new Date(goalProgress.goal.deadline), new Date())
    : null;

  function openRecords() {
    setRecordFilters({
      type: "expense",
      goalId: goalProgress.goal.id,
    });
    navigate("/records");
  }

  return (
    <div>
      <ActionToast toast={toast} />
      <PageHeader
        eyebrow="Goal detail"
        title={goalProgress.goal.name}
        description="Goal detail, reserved money, and directly linked records."
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
                      Target {formatMoney(goalProgress.goal.targetAmount, goalProgress.goal.currency)}
                    </p>
                  </div>
                </div>
                <Badge variant={goalProgress.goal.status === "active" ? "success" : "muted"}>
                  {goalStatusLabels[goalProgress.goal.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <span style={{ width: `${Math.min(100, (goalProgress.spent / goalProgress.goal.targetAmount) * 100)}%`, backgroundColor: goalProgress.goal.color }} />
                <span className="bg-emerald-400" style={{ width: `${Math.min(Math.max(0, 100 - (goalProgress.spent / goalProgress.goal.targetAmount) * 100), (goalProgress.reserved / goalProgress.goal.targetAmount) * 100)}%` }} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Reserved</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.reserved, goalProgress.goal.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Spent</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.spent, goalProgress.goal.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Committed</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.committed, goalProgress.goal.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="font-semibold">
                    {formatMoney(goalProgress.remaining, goalProgress.goal.currency)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {goalProgress.overTarget > 0 ? <Badge variant="warning">Excedido {formatMoney(goalProgress.overTarget, goalProgress.goal.currency)}</Badge> : null}
                {goalProgress.goal.deadline ? (
                  <Badge variant="muted">
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {goalProgress.goal.deadline}
                    {deadlineDays !== null ? ` · ${deadlineDays >= 0 ? `Faltan ${deadlineDays} días` : `Finalizó hace ${Math.abs(deadlineDays)} días`}` : ""}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Linked records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  There are no records linked to this goal yet.
                </p>
              ) : (
                linkedRecords.map((record) => {
                  const association = (record.goalAssociations ?? []).find(
                    (item) => item.goalId === goalProgress.goal.id,
                  );
                  const goalAmount = association?.allocatedAmount ?? record.amount;
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
                        <p className="font-medium">{category?.name ?? "Transfer"}</p>
                        <p className="text-xs text-muted-foreground">
                          {account?.name} · {record.note ?? "No note"}
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
                        {formatMoney(goalAmount, record.currency)}
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
              Reservations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You have not reserved money for this goal yet.
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
                        <p className="font-medium">{account?.name ?? "Account"}</p>
                        <p className="text-xs text-muted-foreground">
                          {reservation.note ?? "Reservation"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">
                          {formatMoney(reservation.amount, reservation.currency)}
                        </p>
                        <input
                          aria-label="Amount to release"
                          className="h-9 w-28 rounded-md border bg-background px-2 text-sm"
                          type="number"
                          min="0.01"
                          max={reservation.amount}
                          step="0.01"
                          value={releaseAmounts[reservation.id] ?? String(reservation.amount)}
                          onChange={(event) => setReleaseAmounts((current) => ({ ...current, [reservation.id]: event.target.value }))}
                        />
                        <Button variant="outline" onClick={() => {
                          const amount = Number(releaseAmounts[reservation.id] ?? reservation.amount);
                          if (amount <= 0 || amount > reservation.amount) return;
                          void runAction(() => releaseGoalReservation({ goalId: reservation.goalId, accountId: reservation.accountId, amount, note: "Liberación desde Goal" }), {
                            processing: "Releasing reservation...", success: "Reservation released", error: "Could not release reservation",
                          }).catch(() => undefined);
                        }}>Liberar</Button>
                      </div>
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


