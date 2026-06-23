import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@shared/calculations";
import type { AccountBalance } from "@shared/types";

interface AccountStateSummaryProps {
  balance: AccountBalance;
}

export function AccountStateSummary({ balance }: AccountStateSummaryProps) {
  const { account } = balance;

  return (
    <Card className="mb-4 border-primary/20 bg-sky-50/70 dark:bg-sky-950/20">
      <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 h-3.5 w-3.5 rounded-full"
            style={{ backgroundColor: account.color }}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{account.name}</p>
              <Badge variant={account.isActive ? "success" : "muted"}>
                {account.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge variant={account.isVisible ? "info" : "muted"}>
                {account.isVisible ? (
                  <Eye className="mr-1 h-3 w-3" />
                ) : (
                  <EyeOff className="mr-1 h-3 w-3" />
                )}
                {account.isVisible ? "Visible" : "Hidden"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Current state of the selected account
            </p>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3 lg:min-w-[520px]">
          <div className="rounded-md border bg-card px-3 py-2">
            <p className="text-muted-foreground">Balance</p>
            <p className="text-lg font-semibold">
              {formatMoney(balance.balance, account.currency)}
            </p>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <p className="text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">
              {formatMoney(balance.totalBalance, account.currency)}
            </p>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <p className="text-muted-foreground">Reserved</p>
            <p className="text-lg font-semibold">
              {formatMoney(balance.reserved, account.currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
