import type { Category } from "./types.js";

export function isCategoryOrDescendant(
  categories: Category[],
  categoryId: string,
  selectedCategoryId: string,
) {
  if (categoryId === selectedCategoryId) return true;

  let current = categories.find((category) => category.id === categoryId);
  while (current?.parentId) {
    if (current.parentId === selectedCategoryId) return true;
    current = categories.find((category) => category.id === current?.parentId);
  }

  return false;
}
