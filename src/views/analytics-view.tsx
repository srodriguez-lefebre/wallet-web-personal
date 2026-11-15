import { formatMoney } from "@shared/calculations";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
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

import { PageHeader } from "@/components/page/page-header";
import { ReadState } from "@/components/page/read-state";
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
import { AccountStateSummary } from "@/components/wallet/account-state-summary";
import { BudgetAssistant } from "@/components/wallet/budget-assistant";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { useAccounts, useAnalytics } from "@/hooks/wallet-entities";
import { categoryBreakdown } from "@/lib/wallet-read-model";
import { useWallet } from "@/providers/wallet-provider";

export function AnalyticsView() {
  const [budgetAssistantOpen, setBudgetAssistantOpen] = useState(false);
  const [budgetAssistantBusy, setBudgetAssistantBusy] = useState(false);
  const [selectedExpenseCategoryId, setSelectedExpenseCategoryId] = useState<string | undefined>();
  const [selectedIncomeCategoryId, setSelectedIncomeCategoryId] = useState<string | undefined>();
  const navigate = useNavigate();
  const {
    dataset,
    selectedMonth,
    selectedPeriodMode,
    selectedDateRange,
    recordFilters,
    setRecordFilters,
  } = useWallet();
  const selectedAccount = recordFilters.accountId
    ? dataset.accounts.find((account) => account.id === recordFilters.accountId)
    : undefined;
  const accounts = useAccounts();
  const report = useAnalytics(
    {
      ...selectedDateRange,
      selectedMonth,
      periodMode: selectedPeriodMode,
      accountId: selectedAccount?.id,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    new Date(),
  );
  const selectedAccountBalance = accounts.balances.find(
    (balance) => balance.account.id === selectedAccount?.id,
  );
  if (!report.model || !report.totals.data)
    return <ReadState label="analytics" error={report.isError} />;
  const {
    summary,
    budgets,
    monthlySeries,
    expenseTrend,
    expenseSequenceTrend,
    savingsRate,
    savingsRateChange,
    emergencyRunway,
    projection,
    allowedDaily,
    recommendations,
  } = report.model;
  const merchants = report.model.merchants.slice(0, 10);
  const expenseCategories = categoryBreakdown(
    report.totals.data,
    "expense",
    selectedExpenseCategoryId,
  );
  const incomeCategories = categoryBreakdown(
    report.totals.data,
    "income",
    selectedIncomeCategoryId,
  );
  const isReportReady = Boolean(report.model);
  const selectedExpenseCategory = selectedExpenseCategoryId
    ? dataset.categories.find((category) => category.id === selectedExpenseCategoryId)
    : undefined;
  const selectedIncomeCategory = selectedIncomeCategoryId
    ? dataset.categories.find((category) => category.id === selectedIncomeCategoryId)
    : undefined;

  function drillExpenseCategory(categoryId: string) {
    if (dataset.categories.some((category) => category.parentId === categoryId)) {
      setSelectedExpenseCategoryId(categoryId);
    }
  }

  function drillIncomeCategory(categoryId: string) {
    if (dataset.categories.some((category) => category.parentId === categoryId)) {
      setSelectedIncomeCategoryId(categoryId);
    }
  }
  function goToRecords(filters: Parameters<typeof setRecordFilters>[0]) {
    setRecordFilters({
      ...filters,
      accountId: filters.accountId ?? selectedAccount?.id,
    });
    void navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title={selectedAccount ? `${selectedAccount.name} analytics` : "Analytics"}
        description={
          selectedAccount
            ? "Reports filtered by this account: records, categories, budgets, and monthly flow."
            : "Reports by category, month, account, cash flow, and balance trend."
        }
      >
        <Dialog
          open={budgetAssistantOpen}
          onOpenChange={(open) => {
            if (!budgetAssistantBusy) setBudgetAssistantOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => setBudgetAssistantOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Budget assistant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create budgets from history</DialogTitle>
              <DialogDescription>
                Review suggested category limits and choose which monthly budgets to create.
              </DialogDescription>
            </DialogHeader>
            {budgetAssistantOpen ? (
              <BudgetAssistant initialMonth={selectedMonth} onBusyChange={setBudgetAssistantBusy} />
            ) : null}
          </DialogContent>
        </Dialog>
        {selectedAccount ? (
          <>
            <Badge variant="info">Account: {selectedAccount.name}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecordFilters({ accountId: undefined })}
            >
              <X className="h-4 w-4" />
              View all
            </Button>
          </>
        ) : null}
      </PageHeader>

      {selectedAccountBalance ? (
        <AccountStateSummary balance={selectedAccountBalance} />
      ) : selectedAccount && !isReportReady ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Loading complete history to calculate the current balance...
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => goToRecords({ type: "income" })}
          className="rounded-md border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-secondary"
        >
          <p className="text-xs font-semibold uppercase text-muted-foreground">Income</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">
            {formatMoney(summary.income, dataset.settings.primaryCurrency)}
          </p>
        </button>
        <button
          type="button"
          onClick={() => goToRecords({ type: "expense" })}
          className="rounded-md border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-secondary"
        >
          <p className="text-xs font-semibold uppercase text-muted-foreground">Expenses</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">
            {formatMoney(summary.expenses, dataset.settings.primaryCurrency)}
          </p>
        </button>
        <button
          type="button"
          onClick={() => goToRecords({ type: "all" })}
          className="rounded-md border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-secondary"
        >
          <p className="text-xs font-semibold uppercase text-muted-foreground">Cash flow</p>
          <p
            className={
              summary.cashFlow >= 0
                ? "mt-2 text-2xl font-semibold text-sky-700 dark:text-sky-300"
                : "mt-2 text-2xl font-semibold text-red-600"
            }
          >
            {formatMoney(summary.cashFlow, dataset.settings.primaryCurrency)}
          </p>
        </button>
        <div className="rounded-md border bg-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Daily average</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatMoney(summary.dailyAverageExpense, dataset.settings.primaryCurrency)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Savings rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <p
                className={
                  savingsRate >= 0
                    ? "text-3xl font-semibold text-emerald-600"
                    : "text-3xl font-semibold text-red-600"
                }
              >
                {savingsRate.toFixed(1)}%
              </p>
              <Badge variant={savingsRateChange >= 0 ? "success" : "danger"}>
                {savingsRateChange >= 0 ? "+" : ""}
                {savingsRateChange.toFixed(1)} pp vs previous
              </Badge>
            </div>
            <Progress
              value={Math.max(0, Math.min(100, savingsRate))}
              indicatorClassName="bg-emerald-500"
            />
            <p className="text-sm text-muted-foreground">
              Share of income left after expenses in the selected period.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency runway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold text-sky-700 dark:text-sky-300">
                {emergencyRunway.months.toFixed(1)} months
              </p>
              <Badge variant="info">6-month reference</Badge>
            </div>
            <Progress
              value={Math.min(100, (emergencyRunway.months / 6) * 100)}
              indicatorClassName="bg-sky-500"
            />
            <p className="text-sm text-muted-foreground">
              Free balance divided by the average expenses of the previous three months.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Expense trend by period</CardTitle>
          </CardHeader>
          <CardContent className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={expenseTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={88}
                  tickFormatter={(value) =>
                    formatMoney(Number(value), dataset.settings.primaryCurrency)
                  }
                />
                <Tooltip
                  formatter={(value) =>
                    formatMoney(Number(value), dataset.settings.primaryCurrency)
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="#EF4444"
                  strokeWidth={3}
                  dot={false}
                  name="Current period"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="#F59E0B"
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
            <CardTitle>Monthly comparison</CardTitle>
          </CardHeader>
          <CardContent className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={70} />
                <Tooltip />
                <Bar dataKey="cashFlow" fill="#2563EB" name="Cash flow" radius={[4, 4, 0, 0]} />
                <Bar dataKey="income" fill="#22C55E" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#EF4444" name="Expenses" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Top merchants</CardTitle>
        </CardHeader>
        <CardContent>
          {!isReportReady ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading complete history to compare merchants…
            </p>
          ) : merchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded purchases in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="mb-3 text-left text-muted-foreground">
                  Recorded account purchases for the selected period. Gross spending; refunds are
                  not deducted.
                </caption>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">
                      Merchant
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Purchases
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Spending
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Average purchase
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((merchant) => (
                    <tr key={merchant.key} className="border-b last:border-0">
                      <th scope="row" className="py-3 text-left font-medium">
                        {merchant.name}
                      </th>
                      <td className="py-3 text-right tabular-nums">{merchant.purchases}</td>
                      <td className="py-3 text-right tabular-nums">
                        {formatMoney(merchant.total, dataset.settings.primaryCurrency)}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {formatMoney(merchant.average, dataset.settings.primaryCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Cumulative spend by expense</CardTitle>
        </CardHeader>
        <CardContent className="h-80 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={expenseSequenceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="expense" tickLine={false} axisLine={false} />
              <YAxis
                width={88}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  formatMoney(Number(value), dataset.settings.primaryCurrency)
                }
              />
              <Tooltip
                formatter={(value) => formatMoney(Number(value), dataset.settings.primaryCurrency)}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="current"
                name="Current period"
                stroke="#EF4444"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="previous"
                name="Previous period"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="previousPrevious"
                name="Two periods ago"
                stroke="#94A3B8"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {selectedExpenseCategory
                  ? `${selectedExpenseCategory.name} breakdown`
                  : "Expenses by category"}
              </CardTitle>
              {selectedExpenseCategory ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedExpenseCategoryId(selectedExpenseCategory.parentId)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                  >
                    {expenseCategories.map((category) => (
                      <Cell
                        key={category.id}
                        fill={category.color}
                        className="cursor-pointer outline-none"
                        onClick={() => drillExpenseCategory(category.id)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      formatMoney(Number(value), dataset.settings.primaryCurrency)
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
              <button
                type="button"
                onClick={() => goToRecords({ type: "income" })}
                className="rounded-md bg-secondary p-3 text-left transition hover:bg-sky-100 dark:hover:bg-sky-950"
              >
                <p className="text-muted-foreground">Income</p>
                <p className="font-semibold">
                  {formatMoney(summary.income, dataset.settings.primaryCurrency)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => goToRecords({ type: "expense" })}
                className="rounded-md bg-secondary p-3 text-left transition hover:bg-sky-100 dark:hover:bg-sky-950"
              >
                <p className="text-muted-foreground">Expense</p>
                <p className="font-semibold">
                  {formatMoney(summary.expenses, dataset.settings.primaryCurrency)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigate("/");
                }}
                className="rounded-md bg-sky-50 p-3 text-left transition hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950"
              >
                <p className="text-muted-foreground">Flow</p>
                <p className="font-semibold text-sky-700 dark:text-sky-300">
                  {formatMoney(summary.cashFlow, dataset.settings.primaryCurrency)}
                </p>
              </button>
            </div>
            <div className="space-y-2">
              {expenseCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => drillExpenseCategory(category.id)}
                  className="flex items-center justify-between rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={category.icon} color={category.color} size="sm" />
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {selectedIncomeCategory
                  ? `${selectedIncomeCategory.name} breakdown`
                  : "Income by category"}
              </CardTitle>
              {selectedIncomeCategory ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIncomeCategoryId(selectedIncomeCategory.parentId)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomeCategories}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                  >
                    {incomeCategories.map((category) => (
                      <Cell
                        key={category.id}
                        fill={category.color}
                        className="cursor-pointer outline-none"
                        onClick={() => drillIncomeCategory(category.id)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      formatMoney(Number(value), dataset.settings.primaryCurrency)
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {incomeCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => drillIncomeCategory(category.id)}
                  className="flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={category.icon} color={category.color} size="sm" />
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

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Budgets</CardTitle>
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
                      {Number.isFinite(budget.spent)
                        ? formatMoney(budget.spent, budget.budget.currency)
                        : "Falta cotización"}{" "}
                      of {formatMoney(budget.budget.limitAmount, budget.budget.currency)}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {Number.isFinite(budget.percentage)
                      ? `${budget.percentage.toFixed(0)}%`
                      : "Falta cotización"}
                  </p>
                </div>
                <Progress
                  value={Number.isFinite(budget.percentage) ? budget.percentage : 0}
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
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Simulator and recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-secondary p-3">
                <p className="text-sm text-muted-foreground">Daily allowance</p>
                <p className="text-xl font-semibold">
                  {formatMoney(allowedDaily, dataset.settings.primaryCurrency)}
                </p>
              </div>
              <div className="rounded-md bg-secondary p-3">
                <p className="text-sm text-muted-foreground">End-of-month projection</p>
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
