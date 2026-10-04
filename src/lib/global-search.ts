import type { RecordFilters, WalletDataset } from "@shared/types";

export type GlobalSearchAction =
  | { type: "navigate"; href: string }
  | { type: "records"; filters: RecordFilters }
  | { type: "new-record" };

export interface GlobalSearchResult {
  id: string;
  label: string;
  kind:
    | "section"
    | "command"
    | "account"
    | "category"
    | "card"
    | "goal"
    | "investment"
    | "record-search";
  description: string;
  action: GlobalSearchAction;
}

export function normalizeGlobalSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

export function globalSearchResults(
  dataset: WalletDataset,
  query: string,
): GlobalSearchResult[] {
  const normalized = normalizeGlobalSearch(query);
  const sections = [
    ["dashboard", "Dashboard", "/"],
    ["accounts", "Accounts", "/accounts"],
    ["cards", "Cards", "/cards"],
    ["records", "Records", "/records"],
    ["analytics", "Analytics", "/analytics"],
    ["goals", "Goals", "/goals"],
    ["debts", "Debts", "/debts"],
    ["investments", "Investments", "/investments"],
    ["data", "Data", "/data"],
    ["settings", "Settings", "/settings"],
  ];
  const candidates: GlobalSearchResult[] = [
    {
      id: "new-record",
      label: "New record",
      kind: "command",
      description: "Open a new draft",
      action: { type: "new-record" },
    },
    {
      id: "review-records",
      label: "Review records",
      kind: "command",
      description: "Needs review · all history",
      action: { type: "records", filters: { paymentStatus: "needs_review" } },
    },
    ...sections.map(
      ([id, label, href]): GlobalSearchResult => ({
        id: `section-${id}`,
        label,
        kind: "section",
        description: id === "records" ? "Section · all history" : "Section",
        action:
          id === "records"
            ? { type: "records", filters: {} }
            : { type: "navigate", href },
      }),
    ),
  ];
  if (!normalized) return candidates;

  for (const account of dataset.accounts.filter(
    (account) => account.isActive && account.isVisible,
  )) {
    candidates.push({
      id: `account-${account.id}`,
      label: account.name,
      kind: "account",
      description: `Account · ${account.currency} · records`,
      action: { type: "records", filters: { accountId: account.id } },
    });
  }
  for (const category of dataset.categories) {
    const parent = dataset.categories.find(
      (candidate) => candidate.id === category.parentId,
    );
    candidates.push({
      id: `category-${category.id}`,
      label: category.name,
      kind: "category",
      description: `Category${parent ? ` · ${parent.name}` : ""} · records`,
      action: { type: "records", filters: { categoryId: category.id } },
    });
  }
  for (const card of dataset.creditCards.filter((card) => card.isActive)) {
    candidates.push({
      id: `card-${card.id}`,
      label: card.name,
      kind: "card",
      description: `Card · ${card.issuer} · ${card.lastFour}`,
      action: {
        type: "navigate",
        href: `/cards/${encodeURIComponent(card.id)}`,
      },
    });
  }
  for (const goal of dataset.goals.filter((goal) => goal.isVisible)) {
    candidates.push({
      id: `goal-${goal.id}`,
      label: goal.name,
      kind: "goal",
      description: `Goal · ${goal.currency}`,
      action: {
        type: "navigate",
        href: `/goals/${encodeURIComponent(goal.id)}`,
      },
    });
  }
  for (const investment of dataset.investments.filter(
    (investment) => investment.isVisible,
  )) {
    candidates.push({
      id: `investment-${investment.id}`,
      label: investment.name,
      kind: "investment",
      description: `Investment · ${investment.currency}`,
      action: {
        type: "navigate",
        href: `/investments/${encodeURIComponent(investment.id)}`,
      },
    });
  }
  return [
    {
      id: "search-records",
      label: `Search records for “${query.trim()}”`,
      kind: "record-search" as const,
      description: "All history · category, counterparty, tags and notes",
      action: { type: "records" as const, filters: { search: query.trim() } },
    },
    ...candidates.filter((result) =>
      normalizeGlobalSearch(`${result.label} ${result.description}`).includes(
        normalized,
      ),
    ),
  ].slice(0, 20);
}
