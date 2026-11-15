import { lazy, Suspense, useEffect, type PropsWithChildren } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { monthKey } from "@shared/dates";

import { CategoryCreationProvider } from "@/features/categories/CategoryCreationProvider";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { WalletQueryProvider, useWalletBootstrap } from "@/providers/wallet-query-provider";
import { useWalletReferenceQuery } from "@/hooks/wallet-entities";
import { ThemeProvider, useTheme } from "@/providers/theme-provider";
import { WalletProvider } from "@/providers/wallet-provider";
import { UnlockView } from "@/views/unlock-view";

const AccountsView = lazy(() =>
  import("@/views/accounts-view").then((module) => ({
    default: module.AccountsView,
  })),
);
const AnalyticsView = lazy(() =>
  import("@/views/analytics-view").then((module) => ({
    default: module.AnalyticsView,
  })),
);
const CardDetailView = lazy(() =>
  import("@/views/card-detail-view").then((module) => ({
    default: module.CardDetailView,
  })),
);
const CardsView = lazy(() =>
  import("@/views/cards-view").then((module) => ({
    default: module.CardsView,
  })),
);
const DashboardView = lazy(() =>
  import("@/views/dashboard-view").then((module) => ({
    default: module.DashboardView,
  })),
);
const DebtsView = lazy(() =>
  import("@/views/debts-view").then((module) => ({
    default: module.DebtsView,
  })),
);
const GoalDetailView = lazy(() =>
  import("@/views/goal-detail-view").then((module) => ({
    default: module.GoalDetailView,
  })),
);
const GoalsView = lazy(() =>
  import("@/views/goals-view").then((module) => ({
    default: module.GoalsView,
  })),
);
const ImportsView = lazy(() =>
  import("@/views/imports-view").then((module) => ({
    default: module.ImportsView,
  })),
);
const InvestmentDetailView = lazy(() =>
  import("@/views/investment-detail-view").then((module) => ({
    default: module.InvestmentDetailView,
  })),
);
const InvestmentsView = lazy(() =>
  import("@/views/investments-view").then((module) => ({
    default: module.InvestmentsView,
  })),
);
const RecordsView = lazy(() =>
  import("@/features/records/RecordsView").then((module) => ({
    default: module.RecordsView,
  })),
);
const CategoriesView = lazy(() =>
  import("@/features/categories/CategoriesView").then((module) => ({
    default: module.CategoriesView,
  })),
);
const SettingsView = lazy(() =>
  import("@/views/settings-view").then((module) => ({
    default: module.SettingsView,
  })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading view...</p>
    </div>
  );
}

function WalletReady({ children }: PropsWithChildren) {
  const bootstrap = useWalletBootstrap();
  const { lock } = useAuth();
  if (bootstrap.isPending)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p role="status">Loading wallet...</p>
      </div>
    );
  if (bootstrap.isError)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="space-y-4 rounded-md border bg-card p-6">
          <h1 className="text-lg font-semibold">Could not load wallet</h1>
          <p role="alert">{bootstrap.error.message}</p>
          <Button onClick={() => void bootstrap.refetch()}>Retry</Button>
          <Button variant="outline" onClick={lock}>
            Lock
          </Button>
        </div>
      </div>
    );
  const months = bootstrap.data.reference.recordSummary.months;
  const currentMonth = monthKey(new Date());
  return (
    <WalletProvider
      initialMonth={months.includes(currentMonth) ? currentMonth : (months[0] ?? currentMonth)}
    >
      <WalletTheme />
      {children}
    </WalletProvider>
  );
}
function WalletTheme() {
  const theme = useWalletReferenceQuery().data?.settings.theme;
  const { setTheme } = useTheme();
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);
  return null;
}

function ProtectedApp() {
  const { isUnlocked } = useAuth();

  if (!isUnlocked) {
    return <UnlockView />;
  }

  return (
    <WalletQueryProvider>
      <WalletReady>
        <CategoryCreationProvider>
          <AppShell>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<DashboardView />} />
                <Route path="/accounts" element={<AccountsView />} />
                <Route path="/cards" element={<CardsView />} />
                <Route path="/cards/:cardId" element={<CardDetailView />} />
                <Route path="/records" element={<RecordsView />} />
                <Route path="/analytics" element={<AnalyticsView />} />
                <Route path="/goals" element={<GoalsView />} />
                <Route path="/goals/:goalId" element={<GoalDetailView />} />
                <Route path="/debts" element={<DebtsView />} />
                <Route path="/investments" element={<InvestmentsView />} />
                <Route path="/investments/:investmentId" element={<InvestmentDetailView />} />
                <Route path="/data" element={<ImportsView />} />
                <Route path="/imports" element={<Navigate to="/data" replace />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/settings/categories" element={<CategoriesView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AppShell>
        </CategoryCreationProvider>
      </WalletReady>
    </WalletQueryProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProtectedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
