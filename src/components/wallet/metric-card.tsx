import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "danger" | "info";
}

const tones = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-300",
  danger: "text-red-600 dark:text-red-300",
  info: "text-sky-600 dark:text-sky-300",
};

export function MetricCard({ label, value, detail, icon, tone = "default" }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className={cn("mt-2 text-2xl font-semibold", tones[tone])}>{value}</p>
            {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
          </div>
          {icon ? (
            <div className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-muted-foreground">
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
