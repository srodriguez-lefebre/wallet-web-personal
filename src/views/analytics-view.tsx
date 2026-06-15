import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateBudgetProgress,
  calculateCategoryExpenses,
  calculateMonthlySeries,
  calculateSummary,
  formatMoney,
} from "@shared/calculations";
import {
  buildSavingsRecommendations,
  calculateAllowedDailySpend,
  calculateEndOfMonthProjection,
} from "@shared/simulations";
import type { WalletRecord } from "@shared/types";

function isAccountRecord(record: WalletRecord, accountId: string) {
  return record.accountId === accountId || record.destinationAccountId === accountId;
}

export function AnalyticsView() {
  const navigate = useNavigate();
  const { dataset, selectedMonth, recordFilters, setRecordFilters } = useWallet();
  const selectedAccount = recordFilters.accountId
    ? dataset.accounts.find((account) => account.id === recordFilters.accountId)
    : undefined;
  const analyticsDataset = selectedAccount
    ? {
        ...dataset,
        accounts: [selectedAccount],
        records: dataset.records.filter((record) =>
          isAccountRecord(record, selectedAccount.id),
        ),
        budgets: dataset.budgets.filter(
          (budget) => !budget.accountId || budget.accountId === selectedAccount.id,
        ),
      }
    : dataset;
  const summary = calculateSummary(analyticsDataset, selectedMonth);
  const categories = calculateCategoryExpenses(analyticsDataset, selectedMonth);
  const budgets = calculateBudgetProgress(analyticsDataset, selectedMonth);
  const monthlySeries = calculateMonthlySeries(analyticsDataset, [
    "2026-04",
    "2026-05",
    "2026-06",
  ]);
  const projection = calculateEndOfMonthProjection(
    analyticsDataset,
    summary.dailyAverageExpense,
  );
  const allowedDaily = calculateAllowedDailySpend(analyticsDataset);
  const recommendations = buildSavingsRecommendations(analyticsDataset);

  function goToRecords(filters: Parameters<typeof setRecordFilters>[0]) {
    setRecordFilters({
      ...filters,
      accountId: filters.accountId ?? selectedAccount?.id,
    });
    navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title={selectedAccount ? `Analiticas de ${selectedAccount.name}` : "Analiticas"}
        description={
          selectedAccount
            ? "Reportes filtrados por esta cuenta: movimientos, categorias, presupuestos y flujo mensual."
            : "Reportes por categoria, mes, cuenta, cash flow y balance trend."
        }
      >
        {selectedAccount ? (
          <>
            <Badge variant="info">Cuenta: {selectedAccount.name}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecordFilters({ accountId: undefined })}
            >
              <X className="h-4 w-4" />
              Ver todo
            </Button>
          </>
        ) : null}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Comparacion mensual</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={70} />
                <Tooltip />
                <Bar dataKey="cashFlow" fill="#2563EB" name="Cash flow" radius={[4, 4, 0, 0]} />
                <Bar dataKey="income" fill="#22C55E" name="Ingresos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#EF4444" name="Gastos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reporte por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
              <button
                type="button"
                onClick={() => goToRecords({ type: "income" })}
                className="rounded-md bg-secondary p-3 text-left transition hover:bg-sky-100 dark:hover:bg-sky-950"
              >
                <p className="text-muted-foreground">Ingreso</p>
                <p className="font-semibold">
                  {formatMoney(summary.income, dataset.settings.primaryCurrency)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => goToRecords({ type: "expense" })}
                className="rounded-md bg-secondary p-3 text-left transition hover:bg-sky-100 dark:hover:bg-sky-950"
              >
                <p className="text-muted-foreground">Gasto</p>
                <p className="font-semibold">
                  {formatMoney(summary.expenses, dataset.settings.primaryCurrency)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-md bg-sky-50 p-3 text-left transition hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950"
              >
                <p className="text-muted-foreground">Flow</p>
                <p className="font-semibold text-sky-700 dark:text-sky-300">
                  {formatMoney(summary.cashFlow, dataset.settings.primaryCurrency)}
                </p>
              </button>
            </div>
            <div className="space-y-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => goToRecords({ type: "expense", categoryId: category.id })}
                  className="flex items-center justify-between rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <p className="font-medium">{category.name}</p>
                  </div>
                  <p className="font-semibold">
                    {formatMoney(category.value, dataset.settings.primaryCurrency)}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {budgets.map((budget) => (
              <button
                key={budget.budget.id}
                type="button"
                onClick={() =>
                  goToRecords({
                    type: "expense",
                    categoryId: budget.budget.categoryId,
                    tagId: budget.budget.tagId,
                    accountId: budget.budget.accountId,
                  })
                }
                className="w-full rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{budget.budget.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatMoney(budget.spent, budget.budget.currency)} de{" "}
                      {formatMoney(budget.budget.limitAmount, budget.budget.currency)}
                    </p>
                  </div>
                  <p className="font-semibold">{budget.percentage.toFixed(0)}%</p>
                </div>
                <Progress
                  value={budget.percentage}
                  className="mt-3"
                  indicatorClassName={
                    budget.status === "exceeded"
                      ? "bg-red-500"
                      : budget.status === "warning"
                        ? "bg-amber-500"
                        : "bg-sky-500"
                  }
                />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Simulador y recomendaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-secondary p-3">
                <p className="text-sm text-muted-foreground">Permitido diario</p>
                <p className="text-xl font-semibold">
                  {formatMoney(allowedDaily, dataset.settings.primaryCurrency)}
                </p>
              </div>
              <div className="rounded-md bg-secondary p-3">
                <p className="text-sm text-muted-foreground">Proyeccion fin de mes</p>
                <p className="text-xl font-semibold">
                  {formatMoney(projection, dataset.settings.primaryCurrency)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {recommendations.map((recommendation) => (
                <div key={recommendation} className="rounded-md border p-3 text-sm">
                  {recommendation}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
