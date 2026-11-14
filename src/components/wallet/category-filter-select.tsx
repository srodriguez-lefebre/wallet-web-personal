import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";

import type { Category } from "@shared/types";

import { CategoryIcon } from "@/components/wallet/category-icon";
import { formatCategoryName } from "@/lib/category-options";

export function CategoryFilterSelect({
  categories,
  value,
  onChange,
  label = "Category",
  emptyLabel = "Categories",
}: {
  categories: Category[];
  value?: string;
  onChange: (categoryId: string | undefined) => void;
  label?: string;
  emptyLabel?: string;
}) {
  const selectedCategory = categories.find((category) => category.id === value);
  const [open, setOpen] = useState(false);

  function choose(id?: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedCategory && (
              <CategoryIcon icon={selectedCategory.icon} color={selectedCategory.color} size="sm" />
            )}
            <span className="truncate">
              {selectedCategory ? formatCategoryName(categories, selectedCategory) : emptyLabel}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={label + " options"}
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-md border bg-card p-1 text-card-foreground shadow-md"
        >
          <button
            type="button"
            aria-pressed={!value}
            className="w-full rounded px-2 py-2 text-left text-sm hover:bg-secondary focus-visible:bg-secondary"
            onClick={() => choose()}
          >
            {emptyLabel}
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={category.id === value}
              className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-secondary focus-visible:bg-secondary aria-pressed:bg-secondary"
              onClick={() => choose(category.id)}
            >
              <CategoryIcon icon={category.icon} color={category.color} size="sm" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {formatCategoryName(categories, category)}
              </span>
              {category.id === value && <Check className="h-4 w-4 shrink-0" aria-hidden />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
