import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  WalletCards,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { MetricCard } from "@/components/wallet/metric-card";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateAccountBalanceAtDate,
  calculateAccountBalances,
  calculateCategoryExpenses,
  calculateCategoryExpensesForDateRange,
  calculateSummary,
  calculateSummaryForDateRange,
  dateKeysForRange,
  dateRangeForMonth,
  formatMoney,
  relativeDateRanges,
  relativeMonthKeys,
} from "@shared/calculations";
import type { DateRange } from "@shared/types";

export function DashboardView() {
  const navigate = useNavigate();
  const {
    dataset,
    selectedMonth,
    selectedPeriodMode,
    selectedDateRange,
    setRecordFilters,
  } = useWallet();
  const summary =
    selectedPeriodMode === "custom"
      ? calculateSummaryForDateRange(dataset, selectedDateRange)
      : calculateSummary(dataset, selectedMonth);
  const accountBalances = calculateAccountBalances(dataset);
  const visibleBalances = accountBalances.filter(
    (item) => item.account.isVisible,
  );
  const primaryBalance =
    accountBalances.find(
      (item) => item.account.id === dataset.settings.primaryAccountId,
    ) ?? visibleBalances[0];
  const categories =
    selectedPeriodMode === "custom"
      ? calculateCategoryExpensesForDateRange(dataset, selectedDateRange)
      : calculateCategoryExpenses(dataset, selectedMonth);
  const balanceCurrency =
    primaryBalance?.account.currency ?? dataset.settings.primaryCurrency;
  const balancePeriods =
    selectedPeriodMode === "custom"
      ? relativeDateRanges(selectedDateRange, 3)
      : relativeMonthKeys(selectedMonth, 3).map(dateRangeForMonth);
  const balanceTrend = buildBalanceComparisonSeries(
    dataset,
    primaryBalance?.account.id,
    balancePeriods,
  );
  const balanceTooltipFormatter = (value: unknown) =>
    formatMoney(Number(value ?? 0), balanceCurrency);
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
        title="Financial overview"
        description="Interactive summary: each metric opens the related records or reports."
      >
        <Badge variant="info">General preset</Badge>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Balance"
          value={
            primaryBalance
              ? formatMoney(
                  primaryBalance.balance,
                  primaryBalance.account.currency,
                )
              : formatMoney(summary.balance, dataset.settings.primaryCurrency)
          }
          detail={
            primaryBalance
              ? `Primary account: ${primaryBalance.account.name}`
              : "Primary account"
          }
          icon={<WalletCards className="h-4 w-4" />}
          tone={
            (primaryBalance?.balance ?? summary.balance) >= 0
              ? "success"
              : "danger"
          }
          onClick={() =>
            primaryBalance
              ? goToRecords({
                  accountId: primaryBalance.account.id,
                  type: "all",
                })
              : goToRecords({ type: "all" })
          }
        />
        <MetricCard
          label="Income"
          value={formatMoney(summary.income, dataset.settings.primaryCurrency)}
          detail="Selected period"
          icon={<ArrowDownRight className="h-4 w-4" />}
          tone="success"
          onClick={() => goToRecords({ type: "income" })}
        />
        <MetricCard
          label="Expenses"
          value={formatMoney(
            summary.expenses,
            dataset.settings.primaryCurrency,
          )}
          detail="Selected period"
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="danger"
          onClick={() => goToRecords({ type: "expense" })}
        />
        <MetricCard
          label="Cash flow"
          value={formatMoney(
            summary.cashFlow,
            dataset.settings.primaryCurrency,
          )}
          detail="Income minus expenses"
          icon={<Landmark className="h-4 w-4" />}
          tone={summary.cashFlow >= 0 ? "success" : "danger"}
          onClick={() => navigate("/analytics")}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Primary account balance</CardTitle>
          </CardHeader>
          <CardContent className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={88}
                  tickFormatter={(value) => balanceTooltipFormatter(value)}
                />
                <Tooltip formatter={balanceTooltipFormatter} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="#2563EB"
                  strokeWidth={3}
                  dot={false}
                  name="Current period"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="#14B8A6"
                  strokeWidth={2}
                  dot={false}
                  name="Previous period"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="previousPrevious"
                  stroke="#64748B"
                  strokeWidth={2}
                  dot={false}
                  name="Two periods ago"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
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
                        goToRecords({
                          type: "expense",
                          categoryId: category.id,
                        })
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
                onClick={() =>
                  goToRecords({ type: "expense", categoryId: category.id })
                }
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <CategoryIcon
                    icon={category.icon}
                    color={category.color}
                    size="sm"
                  />
                  {category.name}
                </span>
                <span className="font-medium">
                  {formatMoney(
                    category.value,
                    dataset.settings.primaryCurrency,
                  )}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Visible accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleBalances.map(
              ({ account, balance, freeBalance, reserved }) => (
                <div
                  key={account.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    goToRecords({ accountId: account.id, type: "all" })
                  }
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
                        Free {formatMoney(freeBalance, account.currency)}
                        {reserved > 0
                          ? ` · Reserved ${formatMoney(reserved, account.currency)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold">
                    {formatMoney(balance, account.currency)}
                  </p>
                </div>
              ),
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest records</CardTitle>
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
                      <p className="font-medium">
                        {category?.name ?? "Transfer"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {account?.name}
                        {record.counterpartyName
                          ? ` · ${record.counterpartyName}`
                          : ""}
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
                    {record.type === "expense"
                      ? "-"
                      : record.type === "income"
                        ? "+"
                        : ""}
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

function buildBalanceComparisonSeries(
  dataset: Parameters<typeof calculateAccountBalanceAtDate>[0],
  accountId: string | undefined,
  ranges: DateRange[],
) {
  const [twoPeriodsAgo, previous, current] = ranges.map((range) =>
    dateKeysForRange(range).map((date) =>
      accountId
        ? calculateAccountBalanceAtDate(dataset, accountId, date)
        : null,
    ),
  );
  const maxDays = Math.max(
    twoPeriodsAgo?.length ?? 0,
    previous?.length ?? 0,
    current?.length ?? 0,
  );

  return Array.from({ length: maxDays }, (_, index) => ({
    day: `Day ${index + 1}`,
    previousPrevious: twoPeriodsAgo?.[index] ?? null,
    previous: previous?.[index] ?? null,
    current: current?.[index] ?? null,
  }));
}
