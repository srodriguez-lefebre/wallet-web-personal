import type { WalletDataset } from "@shared/types";

import { formatCategoryName } from "@/lib/category-options";

export function buildRecordIndexes(
  dataset: Pick<WalletDataset, "accounts" | "categories" | "creditCards" | "tags">,
) {
  return {
    accounts: new Map(dataset.accounts.map((item) => [item.id, item])),
    categories: new Map(dataset.categories.map((item) => [item.id, item])),
    cards: new Map(dataset.creditCards.map((item) => [item.id, item])),
    tags: new Map(dataset.tags.map((item) => [item.id, item])),
    categoryNames: new Map(
      dataset.categories.map((item) => [item.id, formatCategoryName(dataset.categories, item)]),
    ),
  };
}
export type RecordIndexes = ReturnType<typeof buildRecordIndexes>;
