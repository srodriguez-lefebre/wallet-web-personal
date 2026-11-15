import { useState } from "react";
import { isCategoryOrDescendant, type MovementCategoryKind } from "@shared/categories";

import type { CategoryPatch } from "@shared/schemas";
import type { Category } from "@shared/types";

import { useDraftFields } from "@/hooks/use-draft-fields";
import { normalizeCategoryName } from "@/lib/category-options";
import { useActionToast } from "@/lib/use-action-toast";

export const categoryColors = [
  "#2563EB",
  "#0284C7",
  "#0891B2",
  "#0D9488",
  "#059669",
  "#16A34A",
  "#65A30D",
  "#CA8A04",
  "#D97706",
  "#EA580C",
  "#DC2626",
  "#E11D48",
  "#DB2777",
  "#9333EA",
  "#4F46E5",
  "#64748B",
];

export function useCategoryForm({
  categories,
  category,
  parentId,
  initialName,
  initialKind,
  onSave,
  onCreated,
  onClose,
}: {
  categories: Category[];
  category?: Category;
  parentId?: string;
  initialName?: string;
  initialKind?: MovementCategoryKind;
  onSave: (draft: CategoryPatch) => Promise<string>;
  onCreated?: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, fields] = useDraftFields(() => ({
    name: category?.name ?? initialName ?? "",
    kind: category?.kind ?? initialKind ?? ("both" as const),
    parentId: category?.parentId ?? parentId ?? "",
    color:
      category?.color ??
      categories.find((entry) => entry.id === parentId)?.color ??
      categoryColors[0]!,
    icon: category?.icon ?? "tag",
  }));
  const kindEnabled =
    category?.kind !== undefined || categories.some((entry) => entry.kind !== undefined);
  const [error, setError] = useState("");
  const { toast, runAction } = useActionToast();
  const name = draft.name.trim();
  const normalized = normalizeCategoryName(name);
  const duplicate =
    normalized &&
    categories.some(
      (item) =>
        item.id !== category?.id &&
        (item.parentId ?? "") === draft.parentId &&
        normalizeCategoryName(item.name) === normalized,
    ) &&
    (!category ||
      normalizeCategoryName(category.name) !== normalized ||
      (category.parentId ?? "") !== draft.parentId);

  function setParent(next: string) {
    fields.parentId(next);
    setError("");
    if (!category && next)
      fields.color(categories.find((item) => item.id === next)?.color ?? draft.color);
  }

  function setName(next: string) {
    fields.name(next);
    setError("");
  }

  const payload: CategoryPatch = category
    ? {
        ...(name !== category.name && { name }),
        ...(draft.color !== category.color && { color: draft.color }),
        ...(draft.icon !== category.icon && { icon: draft.icon }),
        ...(kindEnabled && draft.kind !== category.kind && { kind: draft.kind }),
        ...(draft.parentId !== (category.parentId ?? "") && { parentId: draft.parentId || null }),
      }
    : {
        ...draft,
        kind: kindEnabled ? draft.kind : undefined,
        name,
        parentId: draft.parentId || undefined,
      };
  const canSubmit = Boolean(normalized && !duplicate && Object.keys(payload).length);
  async function submit() {
    if (!canSubmit) return;
    setError("");
    const result = await runAction(() => onSave(payload), {
      singleFlight: "category-form",
      processing: "Saving category…",
      success: "Category saved",
      error: "Could not save category",
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onCreated?.(result.value);
    onClose();
  }

  return {
    draft,
    kindEnabled,
    fields,
    setParent,
    setName,
    submit,
    toast,
    error: duplicate ? "A sibling category already has this name." : error,
    busy: toast?.status === "processing",
    canSubmit,
    parentFilter: (candidate: Category) =>
      !category || !isCategoryOrDescendant(categories, candidate.id, category.id),
  };
}
