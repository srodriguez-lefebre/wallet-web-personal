import { Banknote, Landmark, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney } from "@shared/calculations";

export function InvestmentsView() {
  const { dataset } = useWallet();

  return (
    <div>
      <PageHeader
        eyebrow="Investments"
        title="Inversiones"
        description="Seguimiento manual de inversiones, deudas, prestamos y cuotas."
      />

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
              return (
                <div key={investment.id} className="rounded-md border p-3">
                  <p className="font-medium">{investment.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{investment.type}</p>
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
                </div>
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
