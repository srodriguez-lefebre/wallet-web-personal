import { CategoryRow } from "./CategoryRow";

import type { CategoryUsage } from "@shared/schemas/categories";
import type { CategoryDetails, CategoryRowAction } from "./CategoryRow";

import { categoryPaths, normalizeCategoryName } from "@/lib/category-options";

function categoryTreeRows(
  categories: CategoryDetails[],
  query: string,
  expansion: Record<string, boolean>,
  defaultExpanded?: boolean,
) {
  const details = new Map(categories.map((category) => [category.id, category]));
  const entries = categoryPaths(categories);
  const term = normalizeCategoryName(query);
  const visible = new Set<string>();
  if (term) {
    for (const { category, path } of entries) {
      if (!normalizeCategoryName(path).includes(term)) continue;
      let current = details.get(category.id);
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = details.get(current.parentId ?? "");
      }
    }
  }
  const parentIds = new Set(categories.map((category) => category.parentId));
  const shown = new Map<string, boolean>();
  return entries.flatMap(({ category, path, depth }) => {
    const isVisible = term
      ? visible.has(category.id)
      : depth === 0 || shown.get(category.parentId ?? "");
    if (!isVisible) return [];
    const expanded = Boolean(term) || (expansion[category.id] ?? defaultExpanded ?? depth === 0);
    shown.set(category.id, expanded);
    return [
      {
        category: details.get(category.id)!,
        depth,
        parentPath: depth ? path.slice(0, -(category.name.length + 3)) : "",
        expandable: !term && parentIds.has(category.id),
        expanded,
      },
    ];
  });
}

export function CategoryTree({
  categories,
  usage,
  query,
  expansion,
  defaultExpanded,
  onToggle,
  onAction,
}: {
  categories: CategoryDetails[];
  usage: Record<string, CategoryUsage>;
  query: string;
  expansion: Record<string, boolean>;
  defaultExpanded?: boolean;
  onToggle: (id: string, expanded: boolean) => void;
  onAction: (action: CategoryRowAction, category: CategoryDetails) => void;
}) {
  const rows = categoryTreeRows(categories, query, expansion, defaultExpanded);
  if (!rows.length)
    return (
      <p className="rounded-md border p-5 text-sm text-muted-foreground">No matching categories.</p>
    );
  return (
    <ul aria-label="Categories" className="rounded-lg border bg-card">
      {rows.map((row) => (
        <CategoryRow
          key={row.category.id}
          {...row}
          usage={usage[row.category.id]}
          onToggle={() => onToggle(row.category.id, !row.expanded)}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}
