import { FormEvent, useState } from "react";
import { Banknote, Landmark, Plus, ReceiptText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
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
import { formatMoney } from "@shared/calculations";
import type { CurrencyCode, Investment } from "@shared/types";

export function InvestmentsView() {
  const navigate = useNavigate();
  const { dataset, addInvestment } = useWallet();
  const [name, setName] = useState("");
  const [type, setType] = useState<Investment["type"]>("fund");
  const [amountInvested, setAmountInvested] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [note, setNote] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  function handleCreateInvestment(event: FormEvent) {
    event.preventDefault();
    const invested = Number(amountInvested);
    const current = Number(currentValue || amountInvested);
    if (!name.trim() || invested <= 0 || current <= 0) return;

    const id = addInvestment({
      name: name.trim(),
      type,
      amountInvested: invested,
      currentValue: current,
      currency,
      startedAt: new Date().toISOString().slice(0, 10),
      note: note || undefined,
    });

    setName("");
    setAmountInvested("");
    setCurrentValue("");
    setNote("");
    setIsCreateOpen(false);
    navigate(`/investments/${id}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Investments"
        title="Inversiones"
        description="Crea inversiones manuales y entra al detalle para ver rendimiento y contexto."
      >
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="icon" aria-label="Nueva inversion">
              <Plus className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva inversion</DialogTitle>
              <DialogDescription>
                Carga una inversion manual para seguir valor actual y rendimiento.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleCreateInvestment}>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Nombre</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Fondo, accion, deposito..."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Tipo</span>
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value as Investment["type"])}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="fund">fund</option>
                    <option value="stock">stock</option>
                    <option value="crypto">crypto</option>
                    <option value="deposit">deposit</option>
                    <option value="other">other</option>
                  </select>
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
                  <span className="text-sm font-medium">Invertido</span>
                  <input
                    value={amountInvested}
                    onChange={(event) => setAmountInvested(event.target.value)}
                    type="number"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="10000"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Valor actual</span>
                  <input
                    value={currentValue}
                    onChange={(event) => setCurrentValue(event.target.value)}
                    type="number"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Opcional"
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Nota</span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Contexto opcional"
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

      <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Inversiones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataset.investments.map((investment) => {
                const gain = investment.currentValue - investment.amountInvested;
                const percentage = (investment.currentValue / investment.amountInvested) * 100;
                return (
                  <button
                    key={investment.id}
                    type="button"
                    onClick={() => navigate(`/investments/${investment.id}`)}
                    className="w-full rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                  >
                    <p className="font-medium">{investment.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{investment.type}</p>
                    <Progress
                      value={Math.min(100, percentage)}
                      className="mt-3"
                      indicatorClassName={gain >= 0 ? "bg-emerald-500" : "bg-red-500"}
                    />
                    <div className="mt-3 flex justify-between text-sm">
                      <span>Actual</span>
                      <span className="font-semibold">
                        {formatMoney(investment.currentValue, investment.currency)}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-sm">
                      <span>Resultado</span>
                      <span className={gain >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {formatMoney(gain, investment.currency)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Deudas y prestamos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataset.debts.map((debt) => {
                const paid = debt.originalAmount - debt.pendingAmount;
                const percentage = (paid / debt.originalAmount) * 100;
                return (
                  <div key={debt.id} className="rounded-md border p-3">
                    <div className="flex justify-between gap-3">
                      <p className="font-medium">{debt.name}</p>
                      <p className="font-semibold">{formatMoney(debt.pendingAmount, debt.currency)}</p>
                    </div>
                    <Progress value={percentage} className="mt-3" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Pagado {percentage.toFixed(0)}%
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4" />
                Cuotas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataset.installmentPlans.map((plan) => {
                const percentage = (plan.installmentsPaid / plan.installmentsTotal) * 100;
                return (
                  <div key={plan.id} className="rounded-md border p-3">
                    <div className="flex justify-between gap-3">
                      <p className="font-medium">{plan.name}</p>
                      <p className="font-semibold">
                        {plan.installmentsPaid}/{plan.installmentsTotal}
                      </p>
                    </div>
                    <Progress value={percentage} className="mt-3" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Total {formatMoney(plan.totalAmount, plan.currency)}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
