import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { WalletProvider } from "@/providers/wallet-provider";
import { AccountsView } from "@/views/accounts-view";
import { AnalyticsView } from "@/views/analytics-view";
import { DashboardView } from "@/views/dashboard-view";
import { GoalsView } from "@/views/goals-view";
import { ImportsView } from "@/views/imports-view";
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
          <Route path="/records" element={<RecordsView />} />
          <Route path="/analytics" element={<AnalyticsView />} />
          <Route path="/goals" element={<GoalsView />} />
          <Route path="/investments" element={<InvestmentsView />} />
          <Route path="/imports" element={<ImportsView />} />
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
