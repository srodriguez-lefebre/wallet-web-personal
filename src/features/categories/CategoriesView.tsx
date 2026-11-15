import { useRef } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { CategoryDeleteDialog } from "./CategoryDeleteDialog";
import { CategoryFormDialog } from "./CategoryFormDialog";
import { CategoryTree } from "./CategoryTree";
import { useCategoriesView } from "./use-categories-view";

import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

export function CategoriesView() {
  const view = useCategoriesView();
  const primaryButton = useRef<HTMLButtonElement>(null);
  const returnFocus = () => primaryButton.current?.focus();
  const { dialog } = view;

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/settings">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
      </Button>
      <PageHeader title="Categories">
        <Button onClick={() => view.setDialog({ action: "create" })} disabled={view.list.isPending}>
          <Plus className="h-4 w-4" /> New category
        </Button>
      </PageHeader>
      <div className="mb-3 space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={view.search}
            onChange={(event) => view.setSearch(event.target.value)}
            aria-label="Search category tree"
            placeholder="Search categories"
            className="min-w-40 flex-1"
          />
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={view.includeArchived}
              onChange={(event) => view.setIncludeArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {view.list.data
              ? `${view.active.length} active${view.includeArchived ? ` · ${view.categories.length - view.active.length} archived` : ""}`
              : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(view.search.trim())}
              onClick={() => view.setAllExpanded(true)}
            >
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(view.search.trim())}
              onClick={() => view.setAllExpanded(false)}
            >
              Collapse all
            </Button>
          </div>
        </div>
      </div>
      {view.list.isPending ? (
        <p role="status" className="text-sm">
          Loading categories…
        </p>
      ) : view.list.isError ? (
        <div className="flex items-center gap-2 text-sm">
          <p role="alert">{view.list.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => void view.list.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <CategoryTree
          categories={view.categories}
          usage={view.usage.data ?? {}}
          query={view.search}
          expansion={view.expansion}
          defaultExpanded={view.defaultExpanded}
          onToggle={view.setExpanded}
          onAction={view.treeAction}
        />
      )}
      {(dialog?.action === "create" || dialog?.action === "edit") && (
        <CategoryFormDialog
          categories={view.active}
          category={dialog.action === "edit" ? dialog.category : undefined}
          parentId={dialog.action === "create" ? dialog.parentId : undefined}
          returnFocus={returnFocus}
          onClose={() => view.setDialog(undefined)}
          onSave={view.save}
        />
      )}
      {(dialog?.action === "archive" || dialog?.action === "merge") && (
        <CategoryDeleteDialog
          categories={view.active}
          source={view.active.find(({ id }) => id === dialog.category.id) ?? dialog.category}
          initialMode={dialog.action}
          usage={view.usage.data ?? {}}
          usageState={
            view.list.isError ||
            view.usage.isError ||
            !view.active.some(({ id }) => id === dialog.category.id)
              ? "error"
              : view.list.isFetching || view.usage.isFetching || view.usage.isPending
                ? "pending"
                : "ready"
          }
          onRetry={view.refreshPreview}
          returnFocus={returnFocus}
          onClose={() => view.setDialog(undefined)}
          onSubmit={view.archive}
        />
      )}
    </div>
  );
}
