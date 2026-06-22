import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { WalletProvider } from "@/providers/wallet-provider";
import { AccountsView } from "@/views/accounts-view";
import { CardDetailView } from "@/views/card-detail-view";
import { CardsView } from "@/views/cards-view";
import { AnalyticsView } from "@/views/analytics-view";
import { DashboardView } from "@/views/dashboard-view";
import { DebtsView } from "@/views/debts-view";
import { GoalDetailView } from "@/views/goal-detail-view";
import { GoalsView } from "@/views/goals-view";
import { ImportsView } from "@/views/imports-view";
import { InvestmentDetailView } from "@/views/investment-detail-view";
import { InvestmentsView } from "@/views/investments-view";
import { RecordsView } from "@/views/records-view";
import { SettingsView } from "@/views/settings-view";
import { UnlockView } from "@/views/unlock-view";

function ProtectedApp() {
  const { isUnlocked } = useAuth();

  if (!isUnlocked) {
    return <UnlockView />;
  }

  return (
    <WalletProvider>
      <AppShell>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
