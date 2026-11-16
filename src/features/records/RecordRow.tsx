import { formatMoney } from "@shared/money";
import { paymentStatusLabels, paymentTypeLabels, recordTypeLabels } from "@shared/constants";
import { normalizeBankMerchant, recordReviewDate, splitImportNote } from "@shared/record-review";
import { Trash2 } from "lucide-react";

import type { PaymentType, WalletRecord } from "@shared/types";
import type { RecordIndexes } from "./record-indexes";
import type { useRecordsView } from "./use-records-view";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { ImportHistory } from "@/components/wallet/record-import-history";
import { ReviewRecordActions } from "@/components/wallet/review-record-actions";
import { cn } from "@/lib/utils";
import { readableForeground } from "@/lib/palette";

const paymentMethodClasses: Record<PaymentType, string> = {
  cash: "bg-muted text-muted-foreground",
  debit: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  credit: "bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  transfer: "bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  other: "bg-muted text-muted-foreground",
};
function formatRecordDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
export type RecordRowModel = Pick<
  ReturnType<typeof useRecordsView>,
  | "dataset"
  | "merchantCorrections"
  | "loadRecord"
  | "reviewSeenThrough"
  | "runAction"
  | "deleteRecord"
  | "reviewCategories"
  | "reviewWrite"
  | "saveReview"
>;
export function RecordRow({
  record,
  model,
  indexes,
}: {
  record: WalletRecord;
  model: RecordRowModel;
  indexes: RecordIndexes;
}) {
  const {
    dataset,
    merchantCorrections,
    loadRecord,
    reviewSeenThrough,
    runAction,
    deleteRecord,
    reviewCategories,
    reviewWrite,
    saveReview,
  } = model;

  const category = record.categoryId ? indexes.categories.get(record.categoryId) : undefined;
  const account = record.accountId ? indexes.accounts.get(record.accountId) : undefined;
  const creditCard = record.creditCardId ? indexes.cards.get(record.creditCardId) : undefined;
  const tags = record.tagIds.map((id) => indexes.tags.get(id)).filter(Boolean);

  const review = record.paymentStatus === "needs_review";
  const parsedNote = splitImportNote(record.note);
  const correction = record.importMerchant
    ? merchantCorrections.get(normalizeBankMerchant(record.importMerchant))
    : undefined;
  const modelSuggestion =
    record.suggestedCategoryId && !indexes.categoryParentIds.has(record.suggestedCategoryId)
      ? indexes.categories.get(record.suggestedCategoryId)
      : undefined;
  return (
    <article
      key={record.id}
      className={cn(
        "min-w-0 rounded-md border",
        review
          ? "border-amber-400 bg-amber-50 dark:border-amber-400/50 dark:bg-amber-500/15"
          : "hover:border-primary/50",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md p-3 transition sm:flex-nowrap",
          review ? "hover:bg-amber-100 dark:hover:bg-amber-500/20" : "hover:bg-secondary",
        )}
      >
        <button
          type="button"
          role="button"
          tabIndex={0}
          onClick={() => loadRecord(record)}
          className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-nowrap"
        >
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryIcon icon={category?.icon} color={category?.color ?? "#0EA5E9"} size="sm" />
              <p className="font-medium">
                {category
                  ? (indexes.categoryNames.get(category.id) ?? category.name)
                  : record.type === "transfer"
                    ? "Transfer"
                    : "Uncategorized"}
              </p>
              <Badge
                variant={
                  record.type === "expense"
                    ? "danger"
                    : record.type === "income"
                      ? "success"
                      : "info"
                }
              >
                {recordTypeLabels[record.type]}
              </Badge>
              <Badge variant={record.paymentStatus === "needs_review" ? "warning" : "muted"}>
                {paymentStatusLabels[record.paymentStatus]}
              </Badge>
              {review && Date.parse(recordReviewDate(record)) > reviewSeenThrough && (
                <Badge variant="warning">New</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {[account?.name, creditCard && `${creditCard.name} **** ${creditCard.lastFour}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {record.importMerchant || record.counterpartyName
                ? ` - ${record.importMerchant ?? record.counterpartyName}`
                : " - No counterparty"}
              {parsedNote.note ? ` - ${parsedNote.note}` : " - No note"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((tag) =>
                tag ? (
                  <Badge key={tag.id} variant="info">
                    {tag.name}
                  </Badge>
                ) : null,
              )}
              <Badge
                variant="muted"
                className={`font-semibold ${paymentMethodClasses[record.paymentType]}`}
                style={
                  record.paymentType === "credit" && creditCard
                    ? {
                        color: readableForeground(creditCard.color),
                        backgroundColor: creditCard.color,
                      }
                    : undefined
                }
              >
                {paymentTypeLabels[record.paymentType]}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <p
              className={
                record.type === "expense"
                  ? "font-semibold text-red-600"
                  : record.type === "income"
                    ? "font-semibold text-emerald-600"
                    : "font-semibold text-sky-600"
              }
            >
              {record.type === "expense" ? "-" : record.type === "income" ? "+" : ""}
              {formatMoney(record.amount, record.currency)}
            </p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {formatRecordDateTime(record.occurredAt)}
            </p>
          </div>
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(event) => {
            event.stopPropagation();
            void runAction(() => deleteRecord(record.id), {
              processing: "Deleting record...",
              success: "Record deleted",
              error: "Could not delete record",
            }).catch(() => undefined);
          }}
          aria-label="Delete record"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {review && (
        <ReviewRecordActions
          key={`${record.id}:${record.updatedAt ?? record.categoryId}`}
          record={record}
          dataset={dataset}
          categories={reviewCategories}
          suggestion={correction?.category ?? modelSuggestion}
          isAiSuggestion={Boolean(!correction && modelSuggestion)}
          autoApply={Boolean(
            correction?.record.merchantCorrection?.autoApply &&
            correction.category.id === record.categoryId,
          )}
          busy={Boolean(reviewWrite)}
          onSave={(patch) => void saveReview(record, patch)}
        />
      )}
      {Boolean(record.importHistory?.length || parsedNote.history.length) && (
        <div className="px-3 pb-3">
          <ImportHistory record={record} />
        </div>
      )}
    </article>
  );
}
