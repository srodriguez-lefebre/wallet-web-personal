import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/page/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateCategoryExpenses,
  calculateMonthlySeries,
  calculateSummary,
  formatMoney,
} from "@shared/calculations";

export function AnalyticsView() {
  const { dataset, selectedMonth } = useWallet();
  const summary = calculateSummary(dataset, selectedMonth);
  const categories = calculateCategoryExpenses(dataset, selectedMonth);
  const monthlySeries = calculateMonthlySeries(dataset, [
    "2026-04",
    "2026-05",
    "2026-06",
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Analiticas"
        description="Reportes por categoria, mes, cuenta, cash flow y balance trend."
      />

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
              <div className="rounded-md bg-secondary p-3">
                <p className="text-muted-foreground">Ingreso</p>
                <p className="font-semibold">
                  {formatMoney(summary.income, dataset.settings.primaryCurrency)}
                </p>
              </div>
              <div className="rounded-md bg-secondary p-3">
                <p className="text-muted-foreground">Gasto</p>
                <p className="font-semibold">
                  {formatMoney(summary.expenses, dataset.settings.primaryCurrency)}
                </p>
              </div>
              <div className="rounded-md bg-secondary p-3">
                <p className="text-muted-foreground">Flow</p>
                <p className="font-semibold">
                  {formatMoney(summary.cashFlow, dataset.settings.primaryCurrency)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between rounded-md border p-3"
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
