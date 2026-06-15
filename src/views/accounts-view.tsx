import { useState } from "react";
import { Eye, EyeOff, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";
import { calculateAccountBalances, formatMoney } from "@shared/calculations";

export function AccountsView() {
  const navigate = useNavigate();
  const {
    dataset,
    setRecordFilters,
    toggleAccountVisibility,
    setPrimaryAccount,
  } = useWallet();
  const [showHidden, setShowHidden] = useState(false);
  const balances = calculateAccountBalances(dataset);
  const visibleBalances = balances.filter((item) => item.account.isVisible);
  const hiddenBalances = balances.filter((item) => !item.account.isVisible);
  const renderedBalances = showHidden ? balances : visibleBalances;

  function openAccountRecords(accountId: string) {
    setRecordFilters({ accountId, type: "all" });
    navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Accounts"
        title="Cuentas"
        description="Toca una cuenta para ver sus registros. Elegi visibilidad y cuenta principal desde aca."
      >
        <Button variant="outline" onClick={() => setShowHidden((current) => !current)}>
          {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showHidden ? "Ocultar ocultas" : `Mostrar ocultas (${hiddenBalances.length})`}
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {renderedBalances.map(({ account, balance, freeBalance, reserved }) => {
          const isPrimary = dataset.settings.primaryAccountId === account.id;

          return (
            <Card
              key={account.id}
              role="button"
              tabIndex={0}
              onClick={() => openAccountRecords(account.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openAccountRecords(account.id);
                }
              }}
              className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {account.name}
                      {isPrimary ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
                    </CardTitle>
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleAccountVisibility(account.id);
                    }}
                  >
                    {account.isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {account.isVisible ? "Ocultar" : "Mostrar"}
                  </Button>
                  <Button
                    variant={isPrimary ? "secondary" : "outline"}
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPrimaryAccount(account.id);
                    }}
                  >
                    <Star className="h-4 w-4" />
                    {isPrimary ? "Principal" : "Set principal"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!showHidden && hiddenBalances.length > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Hay {hiddenBalances.length} cuenta(s) oculta(s). Usá “Mostrar ocultas” para administrarlas.
        </p>
      ) : null}
    </div>
  );
}
