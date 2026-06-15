import { Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";
import { calculateAccountBalances, formatMoney } from "@shared/calculations";

export function AccountsView() {
  const { dataset } = useWallet();
  const balances = calculateAccountBalances(dataset);

  return (
    <div>
      <PageHeader
        eyebrow="Accounts"
        title="Cuentas"
        description="Saldos por cuenta, visibilidad, monedas y transferencias."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {balances.map(({ account, balance, freeBalance, reserved }) => (
          <Card key={account.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{account.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{account.type}</p>
                </div>
                <Badge variant={account.isVisible ? "success" : "muted"}>
                  {account.isVisible ? (
                    <Eye className="mr-1 h-3 w-3" />
                  ) : (
                    <EyeOff className="mr-1 h-3 w-3" />
                  )}
                  {account.isVisible ? "Visible" : "Oculta"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {formatMoney(balance, account.currency)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-muted-foreground">Libre</p>
                  <p className="font-medium">{formatMoney(freeBalance, account.currency)}</p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-muted-foreground">Reservado</p>
                  <p className="font-medium">{formatMoney(reserved, account.currency)}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: account.color }}
                />
                {account.currency} · {account.isActive ? "Activa" : "Inactiva"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
