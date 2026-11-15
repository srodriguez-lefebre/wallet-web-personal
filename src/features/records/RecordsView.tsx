import { Plus } from "lucide-react";

import { RecordFormDialog } from "./RecordFormDialog";
import { RecordFilters } from "./RecordFilters";
import { RecordList } from "./RecordList";
import { ReviewQueueBanner } from "./ReviewQueueBanner";
import { useRecordsView } from "./use-records-view";

import { AccountStateSummary } from "@/components/wallet/account-state-summary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionToast } from "@/components/ui/action-toast";
import { PageHeader } from "@/components/page/page-header";
export function RecordsView() {
  const model = useRecordsView();
  const {
    toggleReviewQueue,
    isReviewQueueOpen,
    reviewCount,
    newReviewCount,
    openNewRecordDialog,
    toast,
    selectedAccountBalance,
    form,
  } = model;
  return (
    <div>
      <ActionToast toast={toast} />
      <PageHeader
        eyebrow="Records"
        title="Records"
        description="Open any record to edit amount, account, counterparty, status, or notes."
      >
        <Button
          variant="outline"
          onClick={toggleReviewQueue}
          aria-label="Open review queue"
          aria-pressed={isReviewQueueOpen}
        >
          Needs review ({reviewCount})
          {newReviewCount > 0 && <Badge variant="warning">{newReviewCount} new</Badge>}
        </Button>
        <Button onClick={openNewRecordDialog}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </PageHeader>
      <ReviewQueueBanner model={model} />
      {selectedAccountBalance ? <AccountStateSummary balance={selectedAccountBalance} /> : null}

      <RecordFormDialog model={form} />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <RecordFilters model={model} />

        <RecordList model={model} />
      </div>
    </div>
  );
}
