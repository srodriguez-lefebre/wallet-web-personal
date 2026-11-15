import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { categorySchema } from "@shared/schemas";

import type { CategoryDetails, CategoryRowAction } from "./CategoryRow";
import type { CategoryPatch } from "@shared/schemas";

import { useWalletData } from "@/providers/wallet-query-provider";
import { useWalletUIActions } from "@/providers/wallet-ui-provider";
import { categoriesQueryOptions, categoryUsageQueryOptions } from "@/services/wallet-queries";

type Dialog =
  | { action: "create"; parentId?: string }
  | { action: "edit" | "archive" | "merge"; category: CategoryDetails };

export function useCategoriesView() {
  const navigate = useNavigate();
  const { client, mutations } = useWalletData();
  const ui = useWalletUIActions();
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const [defaultExpanded, setDefaultExpanded] = useState<boolean>();
  const [dialog, setDialog] = useState<Dialog>();
  const list = useQuery(categoriesQueryOptions(client, includeArchived));
  const usage = useQuery(categoryUsageQueryOptions(client));
  const categories = list.data ?? [];
  const active = categories.filter(({ archivedAt }) => !archivedAt);

  function treeAction(action: CategoryRowAction, category: CategoryDetails) {
    if (action === "records") {
      ui.clearRecordFilters();
      ui.setAllPeriod();
      ui.setRecordFilters({ categoryId: category.id });
      void navigate("/records");
    } else if (action === "child") {
      setDialog({ action: "create", parentId: category.id });
    } else {
      setDialog({ action, category });
      if (action === "archive" || action === "merge") refreshPreview();
    }
  }

  function refreshPreview() {
    void list.refetch();
    void usage.refetch();
  }

  async function save(draft: CategoryPatch) {
    if (dialog?.action === "edit") {
      const result = await mutations["categories.patch"]({
        params: { id: dialog.category.id },
        body: draft,
      });
      return result.id;
    }
    return (await mutations["categories.create"]({ body: categorySchema.parse(draft) })).id;
  }

  async function archive(targetId?: string) {
    if (dialog?.action !== "merge" && dialog?.action !== "archive") return;
    const params = { id: dialog.category.id };
    const result = targetId
      ? await mutations["categories.merge"]({ params, body: { targetId } })
      : await mutations["categories.delete"]({ params });
    result.archivedCategoryIds.forEach((id) => ui.clearArchivedFilter("categoryId", id));
  }

  return {
    list,
    usage,
    categories,
    active,
    search,
    setSearch,
    includeArchived,
    setIncludeArchived,
    expansion,
    defaultExpanded,
    setAllExpanded: (open: boolean) => {
      setDefaultExpanded(open);
      setExpansion({});
    },
    setExpanded: (id: string, expanded: boolean) =>
      setExpansion((previous) => ({ ...previous, [id]: expanded })),
    dialog,
    setDialog,
    treeAction,
    refreshPreview,
    save,
    archive,
  };
}
