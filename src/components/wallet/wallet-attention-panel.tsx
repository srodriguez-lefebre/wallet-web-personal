import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CardStatementAgenda } from "./card-statement-agenda";
import { walletAttention } from "@/lib/wallet-attention";
import { formatMoney } from "@shared/calculations";
import { debtDirectionLabels } from "@shared/constants";
import type { WalletDataset } from "@shared/types";

export function WalletAttentionPanel({
  dataset,
  isComplete,
  onReview,
}: {
  dataset: WalletDataset;
  isComplete: boolean;
  onReview: () => void;
}) {
  const attention = isComplete ? walletAttention(dataset) : null;
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current items across all history, independent of the report period.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!attention ? (
            <p>Loading complete history...</p>
          ) : (
            <>
              {attention.review > 0 && (
                <Button variant="outline" onClick={onReview}>
                  Review {attention.review} pending records
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                Open debts due within 7 days or overdue:{" "}
                {attention.debts.length}
              </p>
              {attention.debts.slice(0, 3).map((debt) => (
                <Link
                  key={debt.id}
                  to="/debts"
                  className="block rounded-md border p-3 hover:bg-secondary"
                >
                  <p className="font-medium">{debt.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {debtDirectionLabels[debt.direction]} · Due{" "}
                    {debt.dueAt!.slice(0, 10)} ·{" "}
                    {debt.pendingAmount === undefined
                      ? "Amount not set"
                      : formatMoney(debt.pendingAmount, debt.currency)}
                  </p>
                </Link>
              ))}
              {attention.debts.length > 3 && (
                <Link to="/debts" className="text-sm underline">
                  View all debts
                </Link>
              )}
              {attention.review === 0 && attention.debts.length === 0 && (
                <p className="text-sm">No pending reviews or debts due soon.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <CardStatementAgenda
        entries={attention?.statements ?? []}
        isComplete={isComplete}
      />
    </div>
  );
}
