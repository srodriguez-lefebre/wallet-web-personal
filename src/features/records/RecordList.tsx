import { format, parseISO } from "date-fns";
import { X } from "lucide-react";
import { useMemo } from "react";

import { RecordDayGroup } from "./RecordDayGroup";
import { buildRecordIndexes } from "./record-indexes";

import type { useRecordsView } from "./use-records-view";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function RecordList({
  model,
}: {
  model: Pick<
    ReturnType<typeof useRecordsView>,
    | "filteredRecords"
    | "isSelectedRangeComplete"
    | "selectedPeriodMode"
    | "selectedDateRange"
    | "selectedMonth"
    | "appliedFilters"
    | "isReviewQueueOpen"
    | "closeReviewQueue"
    | "setRecordFilters"
    | "setShowNoteFilter"
    | "clearRecordFilters"
    | "grouped"
    | "dataset"
    | "merchantCorrections"
    | "loadRecord"
    | "reviewSeenThrough"
    | "runAction"
    | "deleteRecord"
    | "reviewCategories"
    | "reviewWrite"
    | "saveReview"
    | "recordsPage"
    | "isLoadingMoreRecords"
    | "loadMoreRecords"
  >;
}) {
  const {
    filteredRecords,
    isSelectedRangeComplete,
    selectedPeriodMode,
    selectedDateRange,
    selectedMonth,
    appliedFilters,
    isReviewQueueOpen,
    closeReviewQueue,
    setRecordFilters,
    setShowNoteFilter,
    clearRecordFilters,
    grouped,
    dataset,
    recordsPage,
    isLoadingMoreRecords,
    loadMoreRecords,
  } = model;
  const { accounts, categories, creditCards, tags } = dataset;
  const indexes = useMemo(
    () => buildRecordIndexes({ accounts, categories, creditCards, tags }),
    [accounts, categories, creditCards, tags],
  );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {!isSelectedRangeComplete ? (
              <Badge variant="warning">Loading complete range...</Badge>
            ) : null}
            <Badge variant="muted">
              {selectedPeriodMode === "all"
                ? "All history"
                : selectedPeriodMode === "custom"
                  ? `${format(parseISO(selectedDateRange.from), "dd/MM/yyyy")} - ${format(parseISO(selectedDateRange.to), "dd/MM/yyyy")}`
                  : selectedMonth}
            </Badge>
          </div>
        </div>
        {appliedFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
            {appliedFilters.map(([key, label, value]) => (
              <button
                key={key}
                type="button"
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-left text-xs font-medium hover:bg-secondary/70"
                aria-label={`Remove ${label} filter`}
                title={value}
                onClick={() => {
                  if (key === "paymentStatus" && isReviewQueueOpen) closeReviewQueue();
                  else setRecordFilters({ [key]: undefined });
                  if (key === "note") setShowNoteFilter(false);
                }}
              >
                <span className="truncate">
                  {label}: {value}
                </span>
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearRecordFilters();
                setShowNoteFilter(false);
              }}
            >
              Clear all
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {!filteredRecords.length && (
          <div className="space-y-2 py-4 text-sm text-muted-foreground" role="status">
            <p>
              {!isSelectedRangeComplete
                ? "Loading records for this period…"
                : appliedFilters.length
                  ? "No records match the active filters in this period."
                  : "No records in this period."}
            </p>
            {isSelectedRangeComplete && appliedFilters.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                {appliedFilters.map(([key, label, value]) => (
                  <li key={key}>
                    <strong>{label}</strong> · {value}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {Object.entries(grouped).map(([day, records]) => (
          <RecordDayGroup key={day} day={day} records={records} model={model} indexes={indexes} />
        ))}
        {recordsPage.hasMore ? (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              disabled={isLoadingMoreRecords}
              onClick={() => void loadMoreRecords()}
            >
              {isLoadingMoreRecords ? "Loading records..." : "Load older records"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
