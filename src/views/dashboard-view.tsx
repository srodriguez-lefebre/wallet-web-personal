import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Landmark, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { MetricCard } from "@/components/wallet/metric-card";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateAccountBalances,
  calculateCategoryExpenses,
  calculateMonthlySeries,
  calculateSummary,
  formatMoney,
} from "@shared/calculations";

export function DashboardView() {
  const navigate = useNavigate();
  const { dataset, selectedMonth, setRecordFilters } = useWallet();
  const summary = calculateSummary(dataset, selectedMonth);
  const accountBalances = calculateAccountBalances(dataset);
  const visibleBalances = accountBalances.filter((item) => item.account.isVisible);
  const primaryBalance =
    accountBalances.find(
      (item) => item.account.id === dataset.settings.primaryAccountId,
    ) ?? visibleBalances[0];
  const categories = calculateCategoryExpenses(dataset, selectedMonth);
  const monthlySeries = calculateMonthlySeries(dataset, [
    "2026-04",
    "2026-05",
    "2026-06",
  ]);
  const recentRecords = dataset.records
    .slice()
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
    .slice(0, 5);

  function goToRecords(filters: Parameters<typeof setRecordFilters>[0]) {
    setRecordFilters(filters);
    navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="Estado financiero"
        description="Resumen principal interactivo: cada numero abre su contexto en registros o reportes."
      >
        <Badge variant="info">Preset General</Badge>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Balance"
          value={
            primaryBalance
              ? formatMoney(primaryBalance.balance, primaryBalance.account.currency)
              : formatMoney(summary.balance, dataset.settings.primaryCurrency)
          }
          detail={primaryBalance ? `Cuenta principal: ${primaryBalance.account.name}` : "Cuenta principal"}
          icon={<WalletCards className="h-4 w-4" />}
          tone={(primaryBalance?.balance ?? summary.balance) >= 0 ? "success" : "danger"}
          onClick={() =>
            primaryBalance
              ? goToRecords({ accountId: primaryBalance.account.id, type: "all" })
              : goToRecords({ type: "all" })
          }
        />
        <MetricCard
          label="Ingresos"
          value={formatMoney(summary.income, dataset.settings.primaryCurrency)}
          detail="Mes seleccionado"
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="success"
          onClick={() => goToRecords({ type: "income" })}
        />
        <MetricCard
          label="Gastos"
          value={formatMoney(summary.expenses, dataset.settings.primaryCurrency)}
          detail="Mes seleccionado"
          icon={<ArrowDownRight className="h-4 w-4" />}
          tone="danger"
          onClick={() => goToRecords({ type: "expense" })}
        />
        <MetricCard
          label="Cash flow"
          value={formatMoney(summary.cashFlow, dataset.settings.primaryCurrency)}
          detail="Ingresos menos gastos"
          icon={<Landmark className="h-4 w-4" />}
          tone={summary.cashFlow >= 0 ? "success" : "danger"}
          onClick={() => navigate("/analytics")}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cash flow mensual</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySeries}>
                <defs>
                  <linearGradient id="income" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenses" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="flow" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={70} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#22C55E"
                  fill="url(#income)"
                  name="Ingresos"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#EF4444"
                  fill="url(#expenses)"
                  name="Gastos"
                />
                <Area
                  type="monotone"
                  dataKey="cashFlow"
                  stroke="#2563EB"
                  fill="url(#flow)"
                  name="Cash flow"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={64}
                  outerRadius={104}
                  paddingAngle={3}
                >
                  {categories.map((category) => (
                    <Cell
                      key={category.id}
                      fill={category.color}
                      className="cursor-pointer outline-none"
                      onClick={() =>
                        goToRecords({ type: "expense", categoryId: category.id })
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
          <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => goToRecords({ type: "expense", categoryId: category.id })}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <CategoryIcon icon={category.icon} color={category.color} size="sm" />
                  {category.name}
                </span>
                <span className="font-medium">
                  {formatMoney(category.value, dataset.settings.primaryCurrency)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cuentas visibles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleBalances.map(({ account, balance, freeBalance, reserved }) => (
              <div
                key={account.id}
                role="button"
                tabIndex={0}
                onClick={() => goToRecords({ accountId: account.id, type: "all" })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    goToRecords({ accountId: account.id, type: "all" });
                  }
                }}
                className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition hover:border-primary/50 hover:bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: account.color }}
                  />
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Libre {formatMoney(freeBalance, account.currency)}
                      {reserved > 0 ? ` · Reservado ${formatMoney(reserved, account.currency)}` : ""}
                    </p>
                  </div>
                </div>
                <p className="font-semibold">{formatMoney(balance, account.currency)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ultimos registros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRecords.map((record) => {
              const category = dataset.categories.find(
                (item) => item.id === record.categoryId,
              );
              const account = dataset.accounts.find(
                (item) => item.id === record.accountId,
              );

              return (
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    goToRecords({
                      type: record.type,
                      accountId: record.accountId,
                      categoryId: record.categoryId,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      goToRecords({
                        type: record.type,
                        accountId: record.accountId,
                        categoryId: record.categoryId,
                      });
                    }
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition hover:border-primary/50 hover:bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon
                      icon={category?.icon}
                      color={category?.color ?? "#2563EB"}
                    />
                    <div>
                    <p className="font-medium">{category?.name ?? "Transferencia"}</p>
                    <p className="text-xs text-muted-foreground">
                      {account?.name}
                      {record.counterpartyName ? ` · ${record.counterpartyName}` : ""}
                    </p>
                    </div>
                  </div>
                  <p
                    className={
                      record.type === "expense"
                        ? "font-semibold text-red-600"
                        : record.type === "income"
                          ? "font-semibold text-emerald-600"
                          : "font-semibold text-sky-600"
                    }
                  >
                    {record.type === "expense" ? "-" : record.type === "income" ? "+" : ""}
                    {formatMoney(record.amount, record.currency)}
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
