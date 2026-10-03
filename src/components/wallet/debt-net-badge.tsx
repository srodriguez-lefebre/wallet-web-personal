import { Badge } from "@/components/ui/badge";
import { formatMoney, calculateVisibleDebtSummary } from "@shared/calculations";
import type { CurrencyCode } from "@shared/types";
export function DebtNetBadge({
  summary,
  currency,
}: {
  summary: ReturnType<typeof calculateVisibleDebtSummary>;
  currency: CurrencyCode;
}) {
  const unknown =
    summary.openCount > 0 && summary.amountPendingCount === summary.openCount;
  return (
    <Badge
      variant={
        unknown
          ? "warning"
          : summary.amountPendingCount > 0
            ? "warning"
            : summary.net >= 0
              ? "success"
              : "danger"
      }
    >
      {unknown
        ? "Net unavailable · amount or conversion needed"
        : `${summary.amountPendingCount > 0 ? "Known net" : "Net"} ${formatMoney(summary.net, currency)}`}
    </Badge>
  );
}
