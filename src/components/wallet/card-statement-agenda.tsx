import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@shared/calculations";
import type { PendingCardStatement } from "@/lib/cards-presentation";

export function CardStatementAgenda({
  entries,
  isComplete,
}: {
  entries: PendingCardStatement[];
  isComplete: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statement agenda</CardTitle>
        <p className="text-sm text-muted-foreground">
          Closed statements with a remaining balance, including archived cards.
        </p>
      </CardHeader>
      <CardContent>
        {!isComplete ? (
          <p className="text-sm text-muted-foreground">
            Loading complete history to calculate pending statements...
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All closed statements are settled.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => (
              <li key={entry.statement.id}>
                <Link
                  to={entry.href}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md py-3 hover:bg-secondary focus-visible:outline focus-visible:outline-ring"
                >
                  <div>
                    <p className="font-medium">
                      {entry.card.name}{" "}
                      {!entry.card.isActive && (
                        <Badge variant="muted">Archived</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Due {new Date(entry.statement.dueAt).toLocaleDateString()}{" "}
                      · Cycle {entry.statement.cycleEnd.slice(0, 10)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatMoney(
                        entry.dueAmountInLimitCurrency,
                        entry.card.limitCurrency,
                      )}
                    </p>
                    <Badge
                      variant={
                        entry.urgency === "overdue"
                          ? "danger"
                          : entry.urgency === "today" ||
                              entry.urgency === "soon"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {entry.urgency === "overdue"
                        ? "Overdue"
                        : entry.urgency === "today"
                          ? "Due today"
                          : entry.urgency === "soon"
                            ? "Next 7 days"
                            : "Upcoming"}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
