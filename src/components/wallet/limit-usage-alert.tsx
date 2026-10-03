import { Badge } from "@/components/ui/badge";
import { cardLimitWarning } from "@/lib/cards-presentation";

export function LimitUsageAlert({
  utilizationPercent,
}: {
  utilizationPercent: number;
}) {
  const warning = cardLimitWarning(utilizationPercent);
  return warning ? (
    <p className="text-sm">
      <Badge variant={warning.severity}>
        {warning.message} · {warning.percent}% used
      </Badge>
    </p>
  ) : null;
}
