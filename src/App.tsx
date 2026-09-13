import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
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
  import("@/views/records-view").then((module) => ({
    default: module.RecordsView,
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

function ProtectedApp() {
  const { isUnlocked } = useAuth();

  if (!isUnlocked) {
    return <UnlockView />;
  }

  return (
    <WalletProvider>
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
            <Route
              path="/investments/:investmentId"
              element={<InvestmentDetailView />}
            />
            <Route path="/data" element={<ImportsView />} />
            <Route path="/imports" element={<Navigate to="/data" replace />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </WalletProvider>
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
