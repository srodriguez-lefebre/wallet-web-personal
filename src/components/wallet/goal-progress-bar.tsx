import type { GoalProgress } from "@shared/types";

export function GoalProgressBar({ progress }: { progress: GoalProgress }) {
  const completed = progress.goal.status === "completed";
  if (progress.hasMissingExchangeRate && !completed) return null;
  const spent = Math.min(
    100,
    Math.max(0, (progress.spent / progress.goal.targetAmount) * 100),
  );
  const reserved = Math.min(
    100 - spent,
    Math.max(0, (progress.reserved / progress.goal.targetAmount) * 100),
  );

  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={completed ? "Completed goal" : "Goal progress"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={
        completed ? 100 : Math.min(100, Math.max(0, progress.percentage))
      }
    >
      <span
        style={{
          width: `${completed ? 100 : spent}%`,
          backgroundColor: progress.goal.color,
        }}
      />
      {!completed && (
        <span className="bg-emerald-400" style={{ width: `${reserved}%` }} />
      )}
    </div>
  );
}
