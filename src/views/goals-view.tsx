import { FormEvent, useState } from "react";
import { CalendarDays, Flag, PiggyBank, Plus } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import { calculateGoalProgress, formatMoney } from "@shared/calculations";

export function GoalsView() {
  const { dataset, addGoalReservation } = useWallet();
  const goals = calculateGoalProgress(dataset);
  const [goalId, setGoalId] = useState(dataset.goals[0]?.id ?? "");
  const [accountId, setAccountId] = useState(dataset.accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");

  function handleReserve(event: FormEvent) {
    event.preventDefault();
    const account = dataset.accounts.find((item) => item.id === accountId);
    const numericAmount = Number(amount);
    if (!account || !goalId || numericAmount <= 0) return;

    addGoalReservation({
      goalId,
      accountId,
      amount: numericAmount,
      currency: account.currency,
      createdAt: new Date().toISOString(),
      note: "Reserva manual",
    });
    setAmount("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Goals"
        title="Objetivos"
        description="Metas, reservas, gastos vinculados por etiquetas y progreso."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((item) => (
            <Card key={item.goal.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
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
                  <div className="rounded-md bg-secondary p-3">
                    <p className="text-muted-foreground">Comprometido</p>
                    <p className="font-semibold">
                      {formatMoney(item.committed, item.goal.currency)}
                    </p>
                  </div>
                  <div className="rounded-md bg-secondary p-3">
                    <p className="text-muted-foreground">Restante</p>
                    <p className="font-semibold">
                      {formatMoney(item.remaining, item.goal.currency)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.goal.tagIds.map((tagId) => {
                    const tag = dataset.tags.find((candidate) => candidate.id === tagId);
                    return tag ? (
                      <Badge key={tag.id} variant="info">
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
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
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
  );
}
