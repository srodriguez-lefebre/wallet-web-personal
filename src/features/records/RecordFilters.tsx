import { FilterX, Plus } from "lucide-react";

import type { PaymentStatus, RecordType } from "@shared/types";
import type { useRecordsView } from "./use-records-view";

import {
  controlClassName as fieldClassName,
  textareaClassName as noteFieldClassName,
} from "@/components/ui/form/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryCombobox } from "@/components/ui/form/category-combobox";

export function RecordFilters({
  model,
}: {
  model: Pick<
    ReturnType<typeof useRecordsView>,
    | "recordFilters"
    | "updateSearch"
    | "setRecordFilters"
    | "isReviewQueueOpen"
    | "closeReviewQueue"
    | "dataset"
    | "categories"
    | "showNoteFilter"
    | "focusNoteInput"
    | "openNoteFilter"
    | "setShowNoteFilter"
    | "clearRecordFilters"
  >;
}) {
  const {
    recordFilters,
    updateSearch,
    setRecordFilters,
    isReviewQueueOpen,
    closeReviewQueue,
    dataset,
    categories,
    showNoteFilter,
    focusNoteInput,
    openNoteFilter,
    setShowNoteFilter,
    clearRecordFilters,
  } = model;
  return (
    <Card className="h-fit min-w-0">
      <CardHeader className="pb-3">
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <input
          value={recordFilters.search ?? ""}
          onChange={(event) => updateSearch(event.target.value)}
          className={fieldClassName}
          placeholder="Search..."
        />
        <select
          value={recordFilters.type ?? "all"}
          onChange={(event) =>
            setRecordFilters({
              type: event.target.value as "all" | RecordType,
            })
          }
          className={fieldClassName}
        >
          <option value="all">All</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </select>
        <select
          value={recordFilters.paymentStatus ?? "all"}
          onChange={(event) => {
            if (isReviewQueueOpen && event.target.value === "all") closeReviewQueue();
            else
              setRecordFilters({
                paymentStatus: event.target.value as PaymentStatus | "all",
              });
          }}
          className={fieldClassName}
        >
          <option value="all">All statuses</option>
          <option value="needs_review">Needs review</option>
          <option value="cleared">Cleared</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={recordFilters.accountId ?? ""}
          onChange={(event) => setRecordFilters({ accountId: event.target.value || undefined })}
          className={fieldClassName}
        >
          <option value="">Accounts</option>
          {dataset.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          value={recordFilters.creditCardId ?? ""}
          onChange={(event) =>
            setRecordFilters({
              creditCardId: event.target.value || undefined,
              accountId: event.target.value ? undefined : recordFilters.accountId,
            })
          }
          className={fieldClassName}
        >
          <option value="">Cards</option>
          {dataset.creditCards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name} **** {card.lastFour}
            </option>
          ))}
        </select>
        <CategoryCombobox
          categories={categories}
          value={recordFilters.categoryId}
          allowEmpty
          emptyLabel="All categories"
          filter={() => true}
          onChange={(categoryId) => setRecordFilters({ categoryId: categoryId || undefined })}
        />
        {showNoteFilter || recordFilters.note ? (
          <label className="block space-y-1 text-sm">
            <span>Note contains</span>
            <textarea
              ref={focusNoteInput}
              rows={4}
              value={recordFilters.note ?? ""}
              onChange={(event) => setRecordFilters({ note: event.target.value })}
              className={noteFieldClassName}
              placeholder="Paste part of a note"
            />
          </label>
        ) : (
          <Button className="w-full" variant="outline" onClick={openNoteFilter}>
            <Plus className="h-4 w-4" /> Add filter · Note
          </Button>
        )}
        <Button
          className="w-full"
          variant="outline"
          onClick={() => {
            clearRecordFilters();
            setShowNoteFilter(false);
          }}
        >
          <FilterX className="h-4 w-4" />
          Reset
        </Button>
      </CardContent>
    </Card>
  );
}
