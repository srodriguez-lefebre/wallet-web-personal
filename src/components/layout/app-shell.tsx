import { useMemo, useState, type PropsWithChildren } from "react";
import {
  BarChart3,
  CircleDollarSign,
  Download,
  Flag,
  Home,
  LineChart,
  Lock,
  Menu,
  Moon,
  Plus,
  ReceiptText,
  Settings,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { useWallet } from "@/providers/wallet-provider";
import { cn } from "@/lib/utils";
import { monthKey, recentMonthKeys } from "@shared/calculations";

const navItems = [
  { label: "Dashboard", href: "/", icon: Home },
  { label: "Accounts", href: "/accounts", icon: WalletCards },
  { label: "Records", href: "/records", icon: ReceiptText },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Goals", href: "/goals", icon: Flag },
  { label: "Investments", href: "/investments", icon: LineChart },
  { label: "Imports", href: "/imports", icon: Download },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { lock } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { dataset, selectedMonth, setSelectedMonth } = useWallet();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const monthOptions = useMemo(
    () => recentMonthKeys(dataset.records, monthKey(new Date()), 12),
    [dataset.records],
  );

  function formatMonthLabel(month: string) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00.000Z`));
  }

  function openNewRecord() {
    navigate("/records?new=1");
    setIsMobileNavOpen(false);
  }

  const navigation = (
    <nav className="space-y-1 p-3">
      {navItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          onClick={() => setIsMobileNavOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              isActive && "bg-secondary text-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card lg:block">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Personal Wallet</p>
            <p className="text-xs text-muted-foreground">Finance control</p>
          </div>
        </div>

        {navigation}
      </aside>
      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <aside className="relative h-full w-72 border-r bg-card shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <WalletCards className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Personal Wallet</p>
                  <p className="text-xs text-muted-foreground">Finance control</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation"
                onClick={() => setIsMobileNavOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {navigation}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-10 rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              aria-label="Period"
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
            <span className="hidden items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground sm:inline-flex">
              <CircleDollarSign className="h-4 w-4" />
              {dataset.settings.primaryCurrency}
            </span>
          </div>

          <Button onClick={openNewRecord}>
            <Plus className="h-4 w-4" />
            Record
          </Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={lock} aria-label="Lock app">
            <Lock className="h-4 w-4" />
          </Button>
        </header>

        <main className="px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
