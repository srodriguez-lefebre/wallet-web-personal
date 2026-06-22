import * as ProgressPrimitive from "@radix-ui/react-progress";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
  indicatorClassName?: string;
  indicatorStyle?: CSSProperties;
}

export function Progress({ value, className, indicatorClassName, indicatorStyle }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full bg-primary transition-all", indicatorClassName)}
        style={{
          ...indicatorStyle,
          transform: `translateX(-${100 - Math.min(100, value)}%)`,
        }}
      />
    </ProgressPrimitive.Root>
  );
}
