import { X } from "lucide-react";

import type { useRecordsView } from "./use-records-view";

import { Button } from "@/components/ui/button";
import { formatCategoryName } from "@/lib/category-options";

export function ReviewQueueBanner({
  model,
}: {
  model: Pick<
    ReturnType<typeof useRecordsView>,
    | "selectedPeriodMode"
    | "isReviewQueueOpen"
    | "isAllHistoryComplete"
    | "newReviewCount"
    | "reviewCount"
    | "markReviewQueueSeen"
    | "reviewUndo"
    | "reviewWrite"
    | "undoReview"
    | "setReviewUndo"
    | "merchantCorrections"
    | "categories"
    | "saveReview"
  >;
}) {
  const {
    selectedPeriodMode,
    isReviewQueueOpen,
    isAllHistoryComplete,
    newReviewCount,
    reviewCount,
    markReviewQueueSeen,
    reviewUndo,
    reviewWrite,
    undoReview,
    setReviewUndo,
    merchantCorrections,
    categories,
    saveReview,
  } = model;
  return (
    <>
      {selectedPeriodMode === "all" && isReviewQueueOpen && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground" role="status">
            Review queue · All dates
            {isAllHistoryComplete &&
              ` · ${newReviewCount} new · ${reviewCount - newReviewCount} seen, still pending`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!isAllHistoryComplete || !newReviewCount}
            onClick={markReviewQueueSeen}
          >
            Mark queue as seen
          </Button>
        </div>
      )}
      {reviewUndo?.saved?.updatedAt && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          <span role="status">
            Saved review for{" "}
            {reviewUndo.before.importMerchant ?? reviewUndo.before.counterpartyName ?? "record"}.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(reviewWrite)}
            onClick={() => void undoReview()}
          >
            Undo
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss undo"
            onClick={() => setReviewUndo(undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {merchantCorrections.size > 0 && (
        <details className="mb-4 rounded-md border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">Merchant category rules</summary>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {[...merchantCorrections.values()].map(({ record, category }) => (
              <label
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {record.importMerchant} · {formatCategoryName(categories, category)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={record.merchantCorrection?.autoApply ?? false}
                    disabled={Boolean(reviewWrite)}
                    onChange={(event) =>
                      void saveReview(record, {
                        merchantAutoApply: event.target.checked,
                      })
                    }
                  />
                  Apply automatically
                </span>
              </label>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
