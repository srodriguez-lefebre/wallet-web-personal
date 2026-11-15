import { createElement } from "react";

import { readableForeground } from "@/lib/palette";
import { getCategoryIcon } from "@/components/wallet/category-icons";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const iconSizeClasses = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon?: string;
  color?: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  const backgroundColor = color || "#2563EB";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/5",
        sizeClasses[size],
        className,
      )}
      style={{
        backgroundColor,
        color: readableForeground(backgroundColor),
      }}
    >
      {createElement(getCategoryIcon(icon), {
        className: cn("stroke-[2.4]", iconSizeClasses[size]),
      })}
    </span>
  );
}
