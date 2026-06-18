import { useState } from "react";
import { CategoryIcon } from "@/components/wallet/category-icon";

export type CategoryPickerItem = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

interface CategoryPickerProps<T extends CategoryPickerItem> {
  categories: T[];
  value: string;
  onChange: (categoryId: string) => void;
  inputClassName: string;
  getLabel?: (category: T) => string;
}

export function CategoryPicker<T extends CategoryPickerItem>({
  categories,
  value,
  onChange,
  inputClassName,
  getLabel = (category) => category.name,
}: CategoryPickerProps<T>) {
  const selectedCategory = categories.find((category) => category.id === value);
  const [query, setQuery] = useState("");
  const cleanQuery = query.trim().toLowerCase();
  const filteredCategories = categories
    .filter(
      (category) =>
        cleanQuery && getLabel(category).toLowerCase().includes(cleanQuery),
    )
    .slice(0, 6);

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={inputClassName}
        placeholder="Search category"
      />
      {cleanQuery ? (
        <div className="rounded-md border bg-background p-1">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  onChange(category.id);
                  setQuery("");
                }}
                className={
                  category.id === value
                    ? "flex w-full min-w-0 items-center gap-2 rounded-md bg-secondary p-2 text-left text-sm font-medium text-foreground"
                    : "flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                }
              >
                <CategoryIcon
                  icon={category.icon}
                  color={category.color}
                  size="sm"
                />
                <span className="truncate">{getLabel(category)}</span>
              </button>
            ))
          ) : (
            <div className="p-2 text-sm text-muted-foreground">
              No matching categories.
            </div>
          )}
        </div>
      ) : null}
      {selectedCategory ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 text-sm">
          <CategoryIcon
            icon={selectedCategory.icon}
            color={selectedCategory.color}
            size="sm"
          />
          <span className="font-medium">{getLabel(selectedCategory)}</span>
        </div>
      ) : null}
    </div>
  );
}
