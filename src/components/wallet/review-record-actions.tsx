import { useState } from "react";
import { currentReviewIssues } from "@shared/record-review";

import type { RecordPatch } from "@shared/schemas";
import type { Category, WalletDataset, WalletRecord } from "@shared/types";

import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/ui/form/category-combobox";

export function ReviewRecordActions({
  record,
  dataset,
  categories,
  suggestion,
  autoApply,
  busy,
  onSave,
}: {
  record: WalletRecord;
  dataset: WalletDataset;
  categories: Category[];
  suggestion?: Category;
  autoApply: boolean;
  busy: boolean;
  onSave: (patch: RecordPatch) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState(
    categories.some((category) => category.id === record.categoryId)
      ? record.categoryId
      : undefined,
  );
  const [ruleChoice, setRuleChoice] = useState<boolean>();
  const issues = currentReviewIssues(record, dataset);
  const needsCategory = record.type !== "transfer" && !selectedCategory;
  const currentNeedsCategory =
    record.type !== "transfer" && !categories.some((category) => category.id === record.categoryId);
  const canRemember = Boolean(
    record.importMerchant && record.type === "expense" && record.paymentType !== "transfer",
  );
  const canClear = !needsCategory && issues.length === 0;
  const reason =
    [...issues, ...(currentNeedsCategory ? ["Choose a category"] : [])].join(" · ") ||
    "Ready to review";

  function save(clear: boolean) {
    onSave({
      ...(selectedCategory && record.type !== "transfer" ? { categoryId: selectedCategory } : {}),
      ...(clear ? { paymentStatus: "cleared" } : {}),
      ...(canRemember && ruleChoice !== undefined ? { merchantAutoApply: ruleChoice } : {}),
    });
  }

  return (
    <section aria-label="Review actions" className="space-y-2 border-t border-amber-400/40 p-3">
      <p className="text-sm font-medium">{reason}</p>
      {record.type !== "transfer" && (
        <div className="max-w-sm">
          <CategoryCombobox
            categories={categories}
            value={selectedCategory}
            onChange={(id) => {
              setSelectedCategory(id || undefined);
              setRuleChoice(undefined);
            }}
            label="Review category"
            enableCreation
            disabled={busy}
          />
        </div>
      )}
      {suggestion && suggestion.id !== record.categoryId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className="h-auto max-w-full whitespace-normal text-left"
          onClick={() => {
            setSelectedCategory(suggestion.id);
            setRuleChoice(undefined);
          }}
        >
          Use suggestion · {suggestion.name}
        </Button>
      )}
      {canRemember && selectedCategory && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ruleChoice ?? (autoApply && selectedCategory === record.categoryId)}
            disabled={busy}
            onChange={(event) => setRuleChoice(event.target.checked)}
          />
          Apply this category automatically for {record.importMerchant}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {record.type !== "transfer" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              busy ||
              needsCategory ||
              (selectedCategory === record.categoryId && ruleChoice === undefined)
            }
            onClick={() => save(false)}
          >
            Save category
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="h-auto max-w-full whitespace-normal text-left"
          disabled={busy || !canClear}
          onClick={() => save(true)}
        >
          Save and mark reviewed
        </Button>
      </div>
    </section>
  );
}
