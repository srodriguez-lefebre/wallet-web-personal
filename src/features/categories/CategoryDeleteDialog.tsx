import { useState } from "react";
import { isCategoryOrDescendant, protectedCategoryKeys } from "@shared/categories";

import type { CategoryUsage } from "@shared/schemas/categories";
import type { CategoryDetails } from "./CategoryRow";

import { Button } from "@/components/ui/button";
import { CategoryField, FormDialog, SegmentedControl } from "@/components/ui/form";
import { useActionToast } from "@/lib/use-action-toast";

const referenceLabels = {
  records: "Records",
  cardRecords: "Card entries",
  budgets: "Budgets",
  debts: "Debts",
  recurringDebts: "Recurring debts",
  installmentPlans: "Installment plans",
  templates: "Templates",
  merchants: "Merchant rules",
} satisfies Record<Exclude<keyof CategoryUsage, "lastUsedAt">, string>;

export function CategoryDeleteDialog({
  categories,
  source,
  initialMode,
  usage,
  usageState,
  onRetry,
  returnFocus,
  onClose,
  onSubmit,
}: {
  categories: CategoryDetails[];
  source: CategoryDetails;
  initialMode: "archive" | "merge";
  usage: Record<string, CategoryUsage>;
  usageState: "pending" | "error" | "ready";
  onRetry: () => void;
  returnFocus?: () => void;
  onClose: () => void;
  onSubmit: (targetId?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState(initialMode);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");
  const { toast, runAction } = useActionToast();
  const tree = categories.filter(
    (category) =>
      !category.archivedAt && isCategoryOrDescendant(categories, category.id, source.id),
  );
  const complete = tree.length > 0 && tree.every(({ id }) => id in usage);
  const previewReady = usageState === "ready" && complete;
  const treeIds = new Set(tree.map(({ id }) => id));
  const policyCategories = tree.filter(
    ({ systemKey }) => systemKey && !protectedCategoryKeys.some((key) => key === systemKey),
  );
  const targets = categories.filter(
    (category) => !category.archivedAt && !category.isSystem && !treeIds.has(category.id),
  );
  const merged = mode === "merge";
  const allowed = !source.isSystem && (!merged || targets.some((item) => item.id === targetId));

  async function submit() {
    if (!allowed || !previewReady) return;
    const result = await runAction(() => onSubmit(merged ? targetId : undefined), {
      singleFlight: "archive-category",
      processing: "Moving category references…",
      error: "Could not update categories",
    });
    if (result.ok) onClose();
    else setError(result.error.message);
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={merged ? "Merge categories" : "Archive category tree"}
      description={`Choose what happens to references to ${source.name} and its subcategories.`}
      fieldsClassName="grid gap-4"
      saveLabel={merged ? "Merge categories" : "Archive"}
      canSubmit={allowed && previewReady}
      destructive
      busy={toast?.status === "processing"}
      error={error}
      onSubmit={submit}
      returnFocus={returnFocus}
    >
      <SegmentedControl
        label="Action"
        value={mode}
        onValueChange={(value) => {
          setError("");
          setMode(value);
        }}
        options={[
          { value: "archive", label: "Archive" },
          { value: "merge", label: "Merge" },
        ]}
      />
      {merged ? (
        <CategoryField
          enableCreation={false}
          label="Destination category"
          value={targetId}
          categories={categories}
          onChange={setTargetId}
          showRecent={false}
          filter={(category) => targets.some(({ id }) => id === category.id)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Financial references move to Category eliminated. Merchant rules go back to intake for
          classification.
        </p>
      )}
      {tree.length > 1 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Categories to archive</p>
          <ul className="max-h-24 list-disc overflow-y-auto pl-5 text-muted-foreground">
            {tree.map(({ id, name }) => (
              <li key={id}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {usageState === "pending" && (
        <p role="status" className="text-sm">
          Loading usage…
        </p>
      )}
      {(usageState === "error" || (usageState === "ready" && !complete)) && (
        <div className="flex items-center gap-2 text-sm">
          <p role="alert">Could not load usage.</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {previewReady && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 text-sm sm:grid-cols-4">
          {(Object.keys(referenceLabels) as (keyof typeof referenceLabels)[]).map((key) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{referenceLabels[key]}</dt>
              <dd className="font-medium tabular-nums">
                {tree.reduce((count, { id }) => count + (usage[id]?.[key] ?? 0), 0)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {policyCategories.length > 0 && (
        <p className="rounded-md border border-amber-500/50 p-2 text-sm">
          Mail that relies on the ingestion policies for{" "}
          {policyCategories.map(({ name }) => name).join(", ")} may need review after this change.
        </p>
      )}
    </FormDialog>
  );
}
