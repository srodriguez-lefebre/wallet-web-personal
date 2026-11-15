import type { Category } from "./types.js";

export const protectedCategoryKeys = ["unknown_expense", "others", "category_eliminated"] as const;

export function selectableCategory(category: Pick<Category, "systemKey">) {
  return category.systemKey !== "unknown_expense" && category.systemKey !== "category_eliminated";
}

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
