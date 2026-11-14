// @vitest-environment jsdom
import { dateKey, recordsForDateRange } from "@shared/calculations";
import { mockWalletData } from "@shared/mock-data";
import { act, render, type RenderResult } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { WalletProvider, useWallet } from "./wallet-provider";

import type { WalletClient } from "@/services/api-client";

const cacheReferenceFixture = () => ({
  settings: {
    ...mockWalletData.settings,
    primaryAccountId: undefined,
    defaultAccountId: undefined,
    defaultCreditCardId: undefined,
  },
  accounts: [],
  categories: [],
  tags: [],
  creditCards: [],
  goals: [],
  budgets: [],
  exchangeRates: [],
  recordTemplates: [],
});
const api = vi.hoisted(() => ({
  "wallet.bootstrap": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "records.create": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "recordTemplates.create": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "accounts.delete": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "records.delete": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "recordTemplates.delete": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "wallet.get": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "wallet.backup": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "investments.patch": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  "recordTemplates.patch": vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
const auth = vi.hoisted(() => ({
  token: "test-session",
  lock: vi.fn(),
  client: api as unknown as WalletClient,
}));
const theme = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/providers/theme-provider", () => ({ useTheme: () => theme }));
let context: ReturnType<typeof useWallet>;
let tree: RenderResult | undefined;

test("a manual Needs review filter remains distinct from the global queue", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  await act(async () => {
    context.setCustomDateRange({ from: "2020-06-03", to: "2020-06-20" });
    context.setRecordFilters({
      accountId: "bank",
      creditCardId: "card",
      paymentStatus: "needs_review",
      categoryId: "category",
      tagId: "tag",
      goalId: "goal",
      note: "manual note",
      search: "merchant",
      type: "expense",
    });
  });
  const previous = { filters: context.recordFilters, range: context.selectedDateRange };
  expect(context.isReviewQueueOpen).toBe(false);
  // Notifications and global search call this same action, including when the
  // manual status filter already equals needs_review.
  for (let pass = 0; pass < 2; pass++) {
    await act(async () => context.openReviewQueue());
    expect(context.isReviewQueueOpen).toBe(true);
    expect(context.selectedPeriodMode).toBe("all");
    expect(context.recordFilters).toEqual({ type: "all", paymentStatus: "needs_review" });
    await act(async () => context.openReviewQueue());
    await act(async () => context.closeReviewQueue());
    expect(context.isReviewQueueOpen).toBe(false);
    expect(context.selectedPeriodMode).toBe("custom");
    expect(context.selectedDateRange).toEqual(previous.range);
    expect(context.recordFilters).toEqual(previous.filters);
  }
});

test.each(["month", "custom", "all"] as const)(
  "review queue restores the %s context across reentry and dismiss",
  async (mode) => {
    await act(async () => {
      tree = render(
        <WalletProvider>
          <Consumer />
        </WalletProvider>,
      );
    });
    await act(async () => {
      if (mode === "all") context.setAllPeriod();
      if (mode === "custom") context.setCustomDateRange({ from: "2020-01-02", to: "2020-06-30" });
      context.setRecordFilters({
        accountId: "bank",
        creditCardId: "card",
        paymentStatus: "cancelled",
        categoryId: "category",
        tagId: "tag",
        goalId: "goal",
        note: "Lunch",
        search: "merchant",
        type: "expense",
      });
    });
    const previous = {
      filters: context.recordFilters,
      mode: context.selectedPeriodMode,
      range: context.selectedDateRange,
      month: context.selectedMonth,
    };
    for (let pass = 0; pass < 2; pass++) {
      await act(async () => context.openReviewQueue());
      expect(context.selectedPeriodMode).toBe("all");
      expect(context.recordFilters).toEqual({
        type: "all",
        paymentStatus: "needs_review",
      });
      // Reopening from another entry point must not overwrite the return context.
      await act(async () => context.openReviewQueue());
      await act(async () => context.closeReviewQueue());
      expect(context.recordFilters).toEqual(previous.filters);
      expect(context.selectedPeriodMode).toBe(previous.mode);
      expect(context.selectedDateRange).toEqual(previous.range);
      expect(context.selectedMonth).toBe(previous.month);
    }
  },
);

test("explicit search/reset navigation discards an obsolete review return context", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  await act(async () => context.setRecordFilters({ accountId: "previous" }));
  await act(async () => context.openReviewQueue());
  await act(async () => {
    context.clearRecordFilters();
    context.setAllPeriod();
    context.setRecordFilters({ search: "new destination" });
  });
  await act(async () => context.openReviewQueue());
  await act(async () => context.closeReviewQueue());
  expect(context.recordFilters).toEqual({
    type: "all",
    search: "new destination",
  });
  expect(context.selectedPeriodMode).toBe("all");
});
function Consumer() {
  const value = useWallet();
  useEffect(() => {
    context = value;
  }, [value]);
  return <p>{value.dataset.records.length} records</p>;
}
const bootstrap = {
  dataset: mockWalletData,
  recordsPage: { hasMore: true, nextCursor: "page2" },
  generatedDebts: [],
  serverDate: "2026-10-03",
};

test("template quick-use request preserves its identifier until consumed without writing", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  await act(async () => context.requestNewRecord("00000000-0000-4000-8000-000000000001"));
  expect(context.newRecordTemplateId).toBe("00000000-0000-4000-8000-000000000001");
  expect(context.newRecordRequestId).not.toBe(0);
  expect(api["records.create"]).not.toHaveBeenCalled();
  await act(async () => context.consumeNewRecordRequest());
  expect(context.newRecordTemplateId).toBeNull();
  expect(context.newRecordRequestId).toBe(0);
  await act(async () => context.requestNewRecord());
  expect(context.newRecordTemplateId).toBeNull();
});

test("old server snapshots normalize the template library to empty", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  expect(context.dataset.recordTemplates).toEqual([]);
});

test("template actions publish only the canonical reloaded library and retain records", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  const value = {
    name: "Coffee",
    type: "expense" as const,
    amount: 50,
    currency: "UYU" as const,
    paymentType: "cash" as const,
  };
  const template = { ...value, id: "00000000-0000-4000-8000-000000000001" };
  const canonical = {
    ...structuredClone(mockWalletData),
    recordTemplates: [template],
  };
  vi.mocked(api["recordTemplates.create"]).mockResolvedValue(template);
  vi.mocked(api["wallet.get"]).mockResolvedValue(canonical);
  await act(async () => {
    expect(await context.addRecordTemplate(value)).toBe(template.id);
  });
  expect(context.dataset.recordTemplates).toEqual([template]);
  expect(context.dataset.records).toEqual(canonical.records);
  const changed = { ...template, name: "Morning coffee" };
  vi.mocked(api["recordTemplates.patch"]).mockResolvedValue(changed);
  vi.mocked(api["wallet.get"]).mockResolvedValue({
    ...canonical,
    recordTemplates: [changed],
  });
  await act(async () => {
    await context.updateRecordTemplate(template.id, { name: changed.name });
  });
  expect(context.dataset.recordTemplates).toEqual([changed]);
  vi.mocked(api["recordTemplates.delete"]).mockResolvedValue({ deleted: true });
  vi.mocked(api["wallet.get"]).mockResolvedValue({
    ...canonical,
    recordTemplates: [],
  });
  await act(async () => {
    await context.deleteRecordTemplate(template.id);
  });
  expect(context.dataset.recordTemplates).toEqual([]);
  expect(api["records.create"]).not.toHaveBeenCalled();
});

test("failed template writes preserve the library and expose the failure", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  vi.mocked(api["recordTemplates.create"]).mockRejectedValue(new Error("Template limit"));
  await act(async () => {
    await expect(
      context.addRecordTemplate({
        name: "Coffee",
        type: "expense",
        amount: 50,
        currency: "UYU",
        paymentType: "cash",
      }),
    ).rejects.toThrow("Template limit");
  });
  expect(context.dataset.recordTemplates).toEqual([]);
  expect(tree?.container.textContent).toContain("Template limit");
});

test("all history includes the oldest review draft on its local calendar date", async () => {
  const data = structuredClone(mockWalletData);
  data.records = [
    {
      ...data.records[0]!,
      occurredAt: "2020-01-01T00:30:00Z",
      paymentStatus: "needs_review",
    },
  ];
  vi.mocked(api["wallet.bootstrap"]).mockResolvedValue({
    ...bootstrap,
    dataset: data,
  });
  vi.mocked(api["wallet.get"]).mockResolvedValue(data);
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  await act(async () => {
    context.setAllPeriod();
  });
  expect(context.selectedDateRange.from).toBe(dateKey(data.records[0]!.occurredAt));
  expect(recordsForDateRange(context.dataset.records, context.selectedDateRange)).toHaveLength(1);
});

test("investment valuation sends a partial patch and reloads canonical cost and start date", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  const investment = context.dataset.investments[0]!;
  const reloaded = structuredClone(mockWalletData);
  reloaded.investments.find((item) => item.id === investment.id)!.currentValue = 0;
  vi.mocked(api["investments.patch"]).mockResolvedValue({
    ...investment,
    currentValue: 0,
  });
  vi.mocked(api["wallet.get"]).mockResolvedValue(reloaded);
  await act(async () => {
    await context.updateInvestment(investment.id, { currentValue: 0 });
  });
  expect(api["investments.patch"]).toHaveBeenCalledExactlyOnceWith({
    params: { id: investment.id },
    body: { currentValue: 0 },
  });
  expect(context.dataset.investments.find((item) => item.id === investment.id)!).toMatchObject({
    currentValue: 0,
    amountInvested: investment.amountInvested,
    startedAt: investment.startedAt,
    currency: investment.currency,
  });
});
beforeEach(() => {
  vi.clearAllMocks();
  auth.token = "test-session";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api["wallet.bootstrap"]).mockResolvedValue(bootstrap);
  vi.mocked(api["wallet.get"]).mockResolvedValue(structuredClone(mockWalletData));
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

test("account archive refresh retains durable records returned by server", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  const before = context.dataset.records.length;
  vi.mocked(api["accounts.delete"]).mockResolvedValue({ deleted: true });
  const canonical = structuredClone(mockWalletData);
  canonical.accounts[0]!.isActive = false;
  vi.mocked(api["wallet.get"]).mockResolvedValue(canonical);
  await act(async () => {
    await context.deleteAccount(canonical.accounts[0]!.id);
  });
  expect(context.dataset.records).toHaveLength(before);
  expect(context.dataset.accounts[0]!.isActive).toBe(false);
  expect(theme.setTheme).toHaveBeenCalledWith(canonical.settings.theme);
});

test("successful write plus failed reload rejects and preserves visible error feedback", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  vi.mocked(api["records.delete"]).mockResolvedValue({ deleted: true });
  vi.mocked(api["wallet.get"]).mockRejectedValue(new Error("offline"));
  await act(async () => {
    await expect(context.deleteRecord("record")).rejects.toThrow(/saved.*refresh/i);
  });
  expect(context.isAllHistoryComplete).toBe(false);
  expect(tree?.container.textContent).toContain("offline");
  vi.mocked(api["wallet.get"]).mockResolvedValue({
    ...mockWalletData,
    records: [],
  });
  await act(async () => {
    await context.loadMoreRecords();
  });
  expect(context.isAllHistoryComplete).toBe(true);
  expect(context.dataset.records).toEqual([]);
});

test("background boot snapshot cannot undo an edit made while cached data is visible", async () => {
  auth.token = `${btoa(JSON.stringify({ sub: "test-owner" }))}.signature`;
  const storage = {
    getItem: () =>
      JSON.stringify({
        schemaVersion: 3,
        cachedAt: new Date().toISOString(),
        environment: "http://test.local",
        ownerKey: "test-owner",
        reference: cacheReferenceFixture(),
      }),
    setItem: vi.fn(),
  };
  vi.spyOn(window, "localStorage", "get").mockReturnValue({
    ...storage,
    length: 0,
    key: () => null,
    clear: () => {},
    removeItem: () => {},
  });
  let resolve!: (value: typeof bootstrap) => void;
  vi.mocked(api["wallet.bootstrap"]).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  vi.mocked(api["records.delete"]).mockResolvedValue({ deleted: true });
  vi.mocked(api["wallet.get"]).mockResolvedValue({
    ...mockWalletData,
    records: [],
  });
  await act(async () => {
    await context.deleteRecord("record");
  });
  vi.mocked(api["wallet.get"]).mockResolvedValue(mockWalletData);
  await act(async () => {
    resolve(bootstrap);
  });
  expect(context.dataset.records).toEqual([]);
});

test("cached bootstrap failure remains visible and storage quota does not break a later refresh", async () => {
  auth.token = `${btoa(JSON.stringify({ sub: "test-owner" }))}.signature`;
  vi.spyOn(window, "localStorage", "get").mockReturnValue({
    ...{
      getItem: () =>
        JSON.stringify({
          schemaVersion: 3,
          cachedAt: new Date().toISOString(),
          environment: "http://test.local",
          ownerKey: "test-owner",
          reference: cacheReferenceFixture(),
        }),
      setItem() {
        throw new Error("quota");
      },
    },
    length: 0,
    key: () => null,
    clear: () => {},
    removeItem: () => {},
  });
  vi.mocked(api["wallet.bootstrap"]).mockRejectedValue(new Error("offline cached refresh"));
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  expect(tree?.container.textContent).toContain("offline cached refresh");
  expect(context.dataset.records).toEqual([]);
  expect(context.isAllHistoryComplete).toBe(false);
  await act(async () => {
    await context.getCompleteDataset();
  });
  expect(context.isAllHistoryComplete).toBe(true);
});

test("a complete backup can include archived history without publishing it into the active wallet", async () => {
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  const activeCount = context.dataset.records.length;
  const backup = structuredClone(mockWalletData);
  backup.records.push({ ...backup.records[0]!, id: "archived-history" });
  vi.mocked(api["wallet.backup"]).mockResolvedValue(backup);
  let exported: Awaited<ReturnType<typeof context.getBackupDataset>> | undefined;
  await act(async () => {
    exported = await context.getBackupDataset();
  });
  expect(exported!.records.length).toBe(activeCount + 1);
  expect(context.dataset.records.length).toBe(activeCount);
});

test("a pending write cannot recreate private cached data after the wallet is closed", async () => {
  auth.token = `${btoa(JSON.stringify({ sub: "test-owner" }))}.signature`;
  const storage = new Map<string, string>();
  vi.spyOn(window, "localStorage", "get").mockReturnValue({
    ...{
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    length: 0,
    key: () => null,
    clear: () => {},
    removeItem: () => {},
  });
  await act(async () => {
    tree = render(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  let release!: () => void;
  vi.mocked(api["records.delete"]).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ deleted: true });
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = context.deleteRecord("record");
  });
  await act(async () => {
    tree!.unmount();
  });
  tree = undefined;
  storage.delete("wallet-dataset-cache");
  await act(async () => {
    release();
    await pending;
  });
  expect(storage.has("wallet-dataset-cache")).toBe(false);
});
