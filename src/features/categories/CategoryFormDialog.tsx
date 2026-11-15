import { useId, useState } from "react";
import { protectedCategoryKeys } from "@shared/categories";

import { categoryColors, useCategoryForm } from "./use-category-form";

import type { MovementCategoryKind } from "@shared/categories";
import type { CategoryPatch } from "@shared/schemas";
import type { Category } from "@shared/types";

import {
  Field,
  Input,
  ColorInput,
  CategoryField,
  FormDialog,
  SegmentedControl,
} from "@/components/ui/form";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { categoryIconOptions } from "@/components/wallet/category-icons";
import { normalizeCategoryName } from "@/lib/category-options";
import { cn } from "@/lib/utils";

interface Props {
  categories: Category[];
  category?: Category;
  parentId?: string;
  initialName?: string;
  initialKind?: MovementCategoryKind;
  onSave: (draft: CategoryPatch) => Promise<string>;
  onCreated?: (id: string) => void;
  returnFocus?: () => void;
  onClose: () => void;
}

export function CategoryFormDialog(props: Props) {
  const { category, categories, initialKind, onClose } = props;
  const form = useCategoryForm(props);
  const nameId = useId();
  const [iconSearch, setIconSearch] = useState("");
  const [customColor, setCustomColor] = useState(false);
  const isSystem = protectedCategoryKeys.some((key) => key === category?.systemKey);
  const icons = categoryIconOptions.filter(({ label }) =>
    normalizeCategoryName(label).includes(normalizeCategoryName(iconSearch)),
  );

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={category ? "Edit category" : "New category"}
      description={
        category
          ? "Update the category's place in the tree and its appearance."
          : "Choose a name, a parent and an icon."
      }
      saveLabel={category ? "Save category" : "Create category"}
      canSubmit={form.canSubmit}
      busy={form.busy}
      error={form.error}
      onSubmit={form.submit}
      returnFocus={props.returnFocus}
    >
      <Field label="Name" htmlFor={nameId}>
        <Input
          id={nameId}
          value={form.draft.name}
          onChange={(event) => form.setName(event.target.value)}
          autoFocus
          required
          aria-invalid={Boolean(form.error)}
        />
      </Field>
      <div className="space-y-1">
        <CategoryField
          enableCreation={false}
          label="Parent"
          value={form.draft.parentId}
          categories={categories}
          onChange={form.setParent}
          allowEmpty
          emptyLabel="No parent"
          showRecent={false}
          disabled={isSystem}
          filter={form.parentFilter}
        />
        {isSystem && (
          <p className="text-xs text-muted-foreground">System categories have a fixed parent.</p>
        )}
      </div>
      {form.kindEnabled && (
        <div className="space-y-1 md:col-span-2">
          <p className="text-sm font-medium">Type</p>
          <SegmentedControl
            label="Category type"
            value={form.draft.kind}
            onValueChange={form.fields.kind}
            options={[
              { value: "both", label: "Income and expenses" },
              { value: "income", label: "Income", disabled: initialKind === "expense" },
              { value: "expense", label: "Expenses", disabled: initialKind === "income" },
            ]}
          />
        </div>
      )}
      <div className="space-y-2 md:col-span-2">
        <div className="flex items-center gap-2">
          <CategoryIcon icon={form.draft.icon} color={form.draft.color} />
          <span className="text-sm font-medium">{form.draft.name.trim() || "Preview"}</span>
        </div>
        <div
          role="group"
          aria-label="Category colors"
          className="flex flex-wrap items-center gap-2"
        >
          {categoryColors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Use color ${color}`}
              title={color}
              aria-pressed={form.draft.color.toLowerCase() === color.toLowerCase()}
              onClick={() => form.fields.color(color)}
              style={{ backgroundColor: color }}
              className="h-7 w-7 rounded-full border outline-offset-2 focus-visible:outline focus-visible:outline-ring aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2"
            />
          ))}
          <button
            type="button"
            onClick={() => setCustomColor(!customColor)}
            aria-expanded={customColor}
            className="rounded px-2 py-1 text-sm underline-offset-2 hover:underline"
          >
            Other…
          </button>
          {customColor && (
            <ColorInput
              aria-label="Custom category color"
              value={form.draft.color}
              onChange={(event) => form.fields.color(event.target.value)}
            />
          )}
        </div>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Input
          aria-label="Search icons"
          placeholder="Search icons"
          value={iconSearch}
          onChange={(event) => setIconSearch(event.target.value)}
        />
        <div
          role="group"
          aria-label="Category icons"
          className="grid max-h-36 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto rounded-md border p-2"
        >
          {icons.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={form.draft.icon === value}
              onClick={() => form.fields.icon(value)}
              className={cn(
                "grid h-9 place-items-center rounded-md border border-transparent hover:bg-muted focus-visible:outline-ring",
                form.draft.icon === value && "border-primary bg-secondary",
              )}
            >
              <CategoryIcon icon={value} color={form.draft.color} size="sm" />
            </button>
          ))}
          {!icons.length && (
            <p className="col-span-full px-2 py-1 text-sm text-muted-foreground">
              No matching icons.
            </p>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
