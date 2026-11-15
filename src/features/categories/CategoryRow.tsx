import * as Popover from "@radix-ui/react-popover";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import type { CategoryUsage } from "@shared/schemas/categories";
import type { OperationResponse } from "@shared/api-contract";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/wallet/category-icon";

export type CategoryDetails = OperationResponse<"categories.list">[number];
export type CategoryRowAction = "edit" | "child" | "records" | "merge" | "archive";

const actions: { value: CategoryRowAction; label: string; blocksSystem?: boolean }[] = [
  { value: "edit", label: "Edit" },
  { value: "child", label: "New subcategory" },
  { value: "records", label: "View transactions" },
  { value: "merge", label: "Merge", blocksSystem: true },
  { value: "archive", label: "Archive", blocksSystem: true },
];

export function CategoryRow({
  category,
  parentPath,
  usage,
  depth,
  expandable,
  expanded,
  onToggle,
  onAction,
}: {
  category: CategoryDetails;
  parentPath: string;
  usage?: CategoryUsage;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: CategoryRowAction, category: CategoryDetails) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li
      className="flex min-w-0 items-start gap-2 border-b px-2 py-2 last:border-b-0 sm:items-center sm:px-3"
      style={depth ? { marginInlineStart: `min(${depth}rem, 12vw)` } : undefined}
    >
      {expandable ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <CategoryIcon icon={category.icon} color={category.color} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-sm font-medium">{category.name}</span>
          {category.isSystem ? (
            <Badge variant="muted">System</Badge>
          ) : (
            category.systemKey && <Badge variant="info">Ingestion</Badge>
          )}
          {category.kind === "income" && <Badge variant="default">Income</Badge>}
          {category.kind === "expense" && <Badge variant="default">Expense</Badge>}
          {category.archivedAt && <Badge variant="muted">Archived</Badge>}
        </div>
        {parentPath && (
          <p className="truncate text-xs text-muted-foreground" title={parentPath}>
            {parentPath}
          </p>
        )}
        {usage && (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {usage.records} records{usage.cardRecords > 0 && ` · ${usage.cardRecords} card entries`}
            {usage.lastUsedAt &&
              ` · Last used ${formatDistanceToNow(new Date(usage.lastUsedAt), { addSuffix: true })}`}
          </p>
        )}
      </div>
      {!category.archivedAt && (
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label={`Actions for ${category.name}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={4}
              aria-label={`Actions for ${category.name}`}
              className="z-50 flex min-w-44 flex-col gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {actions.map(({ value, label, blocksSystem }) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  disabled={Boolean(blocksSystem && category.isSystem)}
                  onClick={() => {
                    setMenuOpen(false);
                    onAction(value, category);
                  }}
                >
                  {label}
                </Button>
              ))}
              {category.isSystem && (
                <p className="px-2 py-1 text-xs text-muted-foreground">System category</p>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </li>
  );
}
