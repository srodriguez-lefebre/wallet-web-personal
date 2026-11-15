import type { Category } from "@shared/types";

export function normalizeCategoryName(value: string) {
  return value.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function categoryPaths(categories: Category[]) {
  const ordered = [...categories].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const byId = new Map(ordered.map((category) => [category.id, category]));
  const children = new Map<string, Category[]>();
  const entries: { category: Category; root: Category; path: string; depth: number }[] = [];
  const visited = new Set<string>();
  for (const category of ordered) {
    if (category.parentId)
      children.set(category.parentId, [...(children.get(category.parentId) ?? []), category]);
  }
  function walk(category: Category, root: Category, path: string, depth: number) {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    entries.push({ category, root, path, depth });
    for (const child of children.get(category.id) ?? [])
      walk(child, root, `${path} / ${child.name}`, depth + 1);
  }
  for (const category of ordered) {
    if (!category.parentId || !byId.has(category.parentId))
      walk(category, category, category.name, 0);
  }
  for (const category of ordered) walk(category, category, category.name, 0);
  return entries;
}

export function formatCategoryName(categories: Category[], category: Category) {
  const byId = new Map(categories.map((entry) => [entry.id, entry]));
  const parts = [category.name];
  const visited = new Set([category.id]);
  let parentId = category.parentId;
  while (parentId && !visited.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    visited.add(parentId);
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join(" / ");
}

export function sortCategoriesForSelect(categories: Category[]) {
  return categoryPaths(categories).map(({ category }) => category);
}
