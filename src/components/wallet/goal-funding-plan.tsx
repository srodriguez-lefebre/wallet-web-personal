import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@shared/calculations";
import { calculateGoalFundingPlan } from "@shared/planning";
import type { GoalProgress } from "@shared/types";

const messages = {
  funded: "Target funded",
  missing_rate: "Exchange rate needed",
  inactive: "No contributions planned for this status",
  no_deadline: "Set a deadline to plan contributions",
  overdue: "Deadline passed · review the target date",
};

export function GoalFundingPlan({ progress }: { progress: GoalProgress }) {
  const plan = calculateGoalFundingPlan(progress);
  return (
    <div className="mt-4 space-y-3 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Still needed</span>
        <span className="font-semibold">
          {plan.remaining === null
            ? "Unavailable"
            : formatMoney(plan.remaining, progress.goal.currency)}
        </span>
      </div>
      {plan.status === "ready" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted-foreground">Per day</p>
              <p className="font-semibold">
                {formatMoney(plan.dailyContribution!, progress.goal.currency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Next 7 days</p>
              <p className="font-semibold">
                {formatMoney(plan.weeklyContribution!, progress.goal.currency)}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Suggested contributions include today and use the remaining target.
          </p>
        </>
      ) : (
        <Badge
          variant={
            plan.status === "funded"
              ? "success"
              : plan.status === "overdue"
                ? "danger"
                : "muted"
          }
        >
          {messages[plan.status]}
        </Badge>
      )}
    </div>
  );
}
