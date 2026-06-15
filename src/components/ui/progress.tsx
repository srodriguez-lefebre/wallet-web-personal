import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
  indicatorClassName?: string;
}

export function Progress({ value, className, indicatorClassName }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - Math.min(100, value)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
