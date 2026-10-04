import { expect, test } from "vitest";
import { mockWalletData } from "@shared/mock-data";
import { globalSearchResults, normalizeGlobalSearch } from "./global-search";

test("normalizes accents, letter case and surrounding spaces", () => {
  expect(normalizeGlobalSearch("  CRÉDITO Ágil  ")).toBe("credito agil");
});

test("searches entity names with accents and distinguishes equal labels by their destination", () => {
  const dataset = structuredClone(mockWalletData);
  dataset.accounts = [
    {
      ...dataset.accounts[0],
      id: "acct",
      name: "Café",
      isVisible: true,
      isActive: true,
    },
  ];
  dataset.categories = [{ ...dataset.categories[0], id: "cat", name: "Café" }];
  const results = globalSearchResults(dataset, "  CAFE  ");
  expect(results.find((result) => result.kind === "account")).toMatchObject({
    label: "Café",
    action: { type: "records", filters: { accountId: "acct" } },
  });
  expect(results.find((result) => result.kind === "category")).toMatchObject({
    label: "Café",
    action: { type: "records", filters: { categoryId: "cat" } },
  });
  expect(
    results.find((result) => result.id === "search-records"),
  ).toMatchObject({ action: { type: "records", filters: { search: "CAFE" } } });
});

test("omits hidden or archived entities and gives individual results supported detail routes only", () => {
  const dataset = structuredClone(mockWalletData);
  dataset.accounts = [
    { ...dataset.accounts[0], isVisible: false, name: "needle" },
    { ...dataset.accounts[0], id: "inactive", isActive: false, name: "needle" },
  ];
  dataset.creditCards = [
    {
      ...dataset.creditCards[0],
      id: "card/one",
      name: "needle",
      isActive: true,
    },
    {
      ...dataset.creditCards[0],
      id: "inactive-card",
      name: "needle",
      isActive: false,
    },
  ];
  dataset.goals = [
    { ...dataset.goals[0], id: "goal one", name: "needle", isVisible: true },
    {
      ...dataset.goals[0],
      id: "hidden-goal",
      name: "needle",
      isVisible: false,
    },
  ];
  dataset.investments = [
    {
      ...dataset.investments[0],
      id: "investment",
      name: "needle",
      isVisible: true,
    },
    {
      ...dataset.investments[0],
      id: "hidden-investment",
      name: "needle",
      isVisible: false,
    },
  ];
  dataset.debts = [
    { ...dataset.debts[0], id: "debt", name: "needle", isVisible: true },
  ];
  const results = globalSearchResults(dataset, "needle");
  expect(
    results
      .filter((result) => result.kind !== "record-search")
      .map((result) => result.action),
  ).toEqual([
    { type: "navigate", href: "/cards/card%2Fone" },
    { type: "navigate", href: "/goals/goal%20one" },
    { type: "navigate", href: "/investments/investment" },
  ]);
});

test("empty queries offer sections and draft/review commands; text searches stay bounded", () => {
  const dataset = structuredClone(mockWalletData);
  const commands = globalSearchResults(dataset, "  ");
  expect(commands.find((result) => result.id === "new-record")?.action).toEqual(
    { type: "new-record" },
  );
  expect(
    commands.find((result) => result.id === "review-records")?.action,
  ).toEqual({ type: "records", filters: { paymentStatus: "needs_review" } });
  expect(
    commands.find((result) => result.id === "section-records")?.action,
  ).toEqual({ type: "records", filters: {} });
  expect(
    commands.find((result) => result.id === "section-debts")?.action,
  ).toEqual({ type: "navigate", href: "/debts" });
  dataset.accounts = Array.from({ length: 60 }, (_, i) => ({
    ...dataset.accounts[0],
    id: `account-${i}`,
    name: `needle ${i}`,
    isVisible: true,
    isActive: true,
  }));
  const results = globalSearchResults(dataset, "needle");
  expect(results).toHaveLength(20);
  expect(results[0].id).toBe("search-records");
  expect(new Set(results.map((result) => result.id)).size).toBe(20);
});
