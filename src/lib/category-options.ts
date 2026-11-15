import type { Category } from "@shared/types";

export function formatCategoryName(categories: Category[], category: Category) {
  const parent = category.parentId
    ? categories.find((candidate) => candidate.id === category.parentId)
    : undefined;

  return parent ? `${parent.name} / ${category.name}` : category.name;
}

export function sortCategoriesForSelect(categories: Category[]) {
  return categories.slice().sort((a, b) => {
    const aParent = a.parentId
      ? (categories.find((category) => category.id === a.parentId)?.name ?? "")
      : a.name;
    const bParent = b.parentId
      ? (categories.find((category) => category.id === b.parentId)?.name ?? "")
      : b.name;
    const parentCompare = aParent.localeCompare(bParent);

    if (parentCompare !== 0) return parentCompare;
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return a.name.localeCompare(b.name);
  });
}
