// @vitest-environment jsdom
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { mockWalletData } from "@shared/mock-data";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { WalletProvider, useWallet } from "./wallet-provider";
import { WalletQueryProvider, useWalletBootstrap } from "./wallet-query-provider";

import type { WalletClient } from "@/services/api-client";
import type { WalletReference } from "@shared/reference-contract";

import { useRecords } from "@/hooks/wallet-entities";
import { WalletQueryStatus } from "@/components/layout/wallet-query-status";
import { withWalletMetadata } from "@/test/legacy-wallet-view";
import { referenceKey } from "@/services/wallet-queries";

const api = vi.hoisted(() =>
  Object.fromEntries(
    [
      "wallet.bootstrapReference",
      "wallet.reference",
      "records.list",
      "records.create",
      "recordTemplates.create",
      "recordTemplates.patch",
      "recordTemplates.delete",
      "accounts.delete",
      "records.delete",
      "wallet.get",
      "wallet.backup",
      "investments.patch",
    ].map((id) => [id, vi.fn<(...args: unknown[]) => Promise<unknown>>()]),
  ),
);
const auth = vi.hoisted(() => ({
  token: "synthetic-provider",
  client: api as unknown as WalletClient,
}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));
let context: ReturnType<typeof useWallet>;
let cache: QueryClient;
let page: ReturnType<typeof useRecords>;
let reference: WalletReference;
function refs() {
  const { dataset, recordSummary, merchantCorrections, debtRecordCounts } = withWalletMetadata({
    dataset: structuredClone(mockWalletData),
  });
  return {
    ...dataset,
    recordSummary,
    merchantCorrections,
    debtRecordCounts,
    recordTemplates: dataset.recordTemplates ?? [],
    goals: dataset.goals.map((goal) => ({
      ...goal,
      autoCaptureEnabled: goal.autoCaptureEnabled ?? false,
      tagIds: goal.tagIds ?? [],
    })),
  };
}
function pageFixture() {
  return {
    items: structuredClone(mockWalletData.records.slice(0, 1)),
    hasMore: true,
    nextCursor: "synthetic-page-2",
  };
}
function Consumer() {
  const value = useWallet();
  const currentCache = useQueryClient();
  const records = useRecords();
  useEffect(() => {
    context = value;
    cache = currentCache;
    page = records;
  }, [value, currentCache, records]);
  return (
    <>
      <p>{records.records.length} records</p>
      <WalletQueryStatus />
    </>
  );
}
function Gate({ children }: PropsWithChildren) {
  const boot = useWalletBootstrap();
  if (boot.isPending) return <p>Loading</p>;
  if (boot.isError)
    return (
      <>
        <p role="alert">{boot.error.message}</p>
        <button onClick={() => void boot.refetch()}>Retry bootstrap</button>
      </>
    );
  return <WalletProvider>{children}</WalletProvider>;
}
function TestWallet({ children }: PropsWithChildren) {
  return (
    <WalletQueryProvider>
      <Gate>{children}</Gate>
    </WalletQueryProvider>
  );
}
async function mount() {
  render(
    <TestWallet>
      <Consumer />
    </TestWallet>,
  );
  await screen.findByText("1 records");
}
beforeEach(() => {
  vi.resetAllMocks();
  reference = refs();
  api["wallet.bootstrapReference"]!.mockImplementation(async () => ({
    reference,
    recordsPage: pageFixture(),
    generatedDebts: [],
    serverDate: "2026-11-14",
  }));
  api["wallet.reference"]!.mockImplementation(async () => structuredClone(reference));
  api["records.list"]!.mockImplementation(async () => pageFixture());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

test("a manual Needs review filter remains distinct from the global queue", async () => {
  await act(async () => {
    render(
      <TestWallet>
        <Consumer />
      </TestWallet>,
    );
  });
  await screen.findByText("1 records");
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
      render(
        <TestWallet>
          <Consumer />
        </TestWallet>,
      );
    });
    await screen.findByText("1 records");
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
    render(
      <TestWallet>
        <Consumer />
      </TestWallet>,
    );
  });
  await screen.findByText("1 records");
  await act(async () => context.setRecordFilters({ accountId: "previous" }));
  await act(async () => context.openReviewQueue());
  await screen.findByText("1 records");
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

test("template quick-use retains its identifier until consumed without writing", async () => {
  await mount();
  act(() => context.requestNewRecord("synthetic-template"));
  expect(context.newRecordTemplateId).toBe("synthetic-template");
  expect(context.newRecordRequestId).not.toBe(0);
  expect(api["records.create"]).not.toHaveBeenCalled();
  act(() => context.consumeNewRecordRequest());
  expect(context.newRecordTemplateId).toBeNull();
  expect(context.newRecordRequestId).toBe(0);
});
test("template CRUD publishes canonical reference and leaves paginated history intact", async () => {
  await mount();
  const before = page.records;
  const value = {
    name: "Synthetic coffee",
    type: "expense" as const,
    amount: 50,
    currency: "UYU" as const,
    paymentType: "cash" as const,
  };
  const template = { ...value, id: "synthetic-template" };
  api["recordTemplates.create"]!.mockImplementation(async () => {
    reference = { ...reference, recordTemplates: [template] };
    return template;
  });
  await act(async () => {
    expect(await context.addRecordTemplate(value)).toBe(template.id);
  });
  await waitFor(() => expect(context.dataset.recordTemplates).toEqual([template]));
  const changed = { ...template, name: "Synthetic morning coffee" };
  api["recordTemplates.patch"]!.mockImplementation(async () => {
    reference = { ...reference, recordTemplates: [changed] };
    return changed;
  });
  await act(async () => context.updateRecordTemplate(template.id, { name: changed.name }));
  await waitFor(() => expect(context.dataset.recordTemplates).toEqual([changed]));
  api["recordTemplates.delete"]!.mockImplementation(async () => {
    reference = { ...reference, recordTemplates: [] };
    return { deleted: true };
  });
  await act(async () => context.deleteRecordTemplate(template.id));
  await waitFor(() => expect(context.dataset.recordTemplates).toEqual([]));
  expect(page.records).toEqual(before);
  expect(api["records.list"]).not.toHaveBeenCalled();
  expect(api["wallet.get"]).not.toHaveBeenCalled();
});
test("failed template writes preserve the library and reject for form feedback", async () => {
  await mount();
  const before = context.dataset.recordTemplates;
  api["recordTemplates.create"]!.mockRejectedValue(new Error("Template limit"));
  await act(async () => {
    await expect(
      context.addRecordTemplate({
        name: "Synthetic coffee",
        type: "expense",
        amount: 50,
        currency: "UYU",
        paymentType: "cash",
      }),
    ).rejects.toThrow("Template limit");
  });
  expect(context.dataset.recordTemplates).toEqual(before);
});
test("all-history dates and review counts use complete local-calendar metadata", async () => {
  reference = {
    ...reference,
    recordSummary: { ...reference.recordSummary, from: "2019-12-31", to: "2026-11-01", review: 41 },
  };
  await mount();
  act(() => context.setAllPeriod());
  expect(context.selectedDateRange).toEqual({ from: "2019-12-31", to: "2026-11-01" });
  expect(context.recordSummary.review).toBe(41);
  expect(page.records).toHaveLength(1);
  expect(context.dataset.records).toEqual([]);
});
test("investment valuation preserves cost, currency and date through a partial patch", async () => {
  await mount();
  const investment = context.dataset.investments[0]!;
  api["investments.patch"]!.mockImplementation(async () => {
    reference = {
      ...reference,
      investments: reference.investments.map((row) =>
        row.id === investment.id ? { ...row, currentValue: 0 } : row,
      ),
    };
    return { ...investment, currentValue: 0 };
  });
  await act(async () => context.updateInvestment(investment.id, { currentValue: 0 }));
  expect(api["investments.patch"]).toHaveBeenCalledTimes(1);
  expect(api["investments.patch"]!.mock.calls[0]?.[0]).toMatchObject({
    params: { id: investment.id },
    body: { currentValue: 0 },
  });
  await waitFor(() =>
    expect(context.dataset.investments.find((row) => row.id === investment.id)).toEqual({
      ...investment,
      currentValue: 0,
    }),
  );
});
test("account archival retains canonical paginated financial history", async () => {
  await mount();
  const before = page.records;
  const account = reference.accounts[0]!;
  api["accounts.delete"]!.mockImplementation(async () => {
    reference = {
      ...reference,
      accounts: reference.accounts.map((row) =>
        row.id === account.id ? { ...row, isActive: false } : row,
      ),
    };
    return { deleted: true };
  });
  await act(async () => context.deleteAccount(account.id));
  await waitFor(() => expect(context.dataset.accounts[0]!.isActive).toBe(false));
  expect(page.records).toEqual(before);
});
test("confirmed write plus failed refetch exposes stale data and refresh retry never repeats the write", async () => {
  await mount();
  api["records.delete"]!.mockResolvedValue({ deleted: true });
  api["records.list"]!.mockRejectedValue(new Error("offline canonical page"));
  await act(async () => context.deleteRecord(page.records[0]!.id));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("Values may be out of date");
  expect(cache.getQueryCache().find({ queryKey: ["records"], exact: false })?.state.status).toBe(
    "error",
  );
  expect(page.records).toHaveLength(1);
  expect(api["records.delete"]).toHaveBeenCalledTimes(1);
  api["records.list"]!.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  fireEvent.click(screen.getByText("Retry refresh"));
  await screen.findByText("0 records");
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(api["records.delete"]).toHaveBeenCalledTimes(1);
});
test("bootstrap failure stays visible and retry works even when browser storage is unavailable", async () => {
  api["wallet.bootstrapReference"]!.mockRejectedValueOnce(new Error("offline bootstrap"));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  render(
    <TestWallet>
      <Consumer />
    </TestWallet>,
  );
  expect((await screen.findByRole("alert")).textContent).toContain("offline bootstrap");
  fireEvent.click(screen.getByText("Retry bootstrap"));
  await screen.findByText("1 records");
  expect(api["wallet.bootstrapReference"]).toHaveBeenCalledTimes(2);
});
test("backup and complete reads never replace the active reference or record pages", async () => {
  await mount();
  const before = cache.getQueryData(referenceKey);
  const snapshot = {
    ...structuredClone(mockWalletData),
    records: [
      ...mockWalletData.records,
      { ...mockWalletData.records[0]!, id: "synthetic-archived" },
    ],
  };
  api["wallet.backup"]!.mockResolvedValue(snapshot);
  api["wallet.get"]!.mockResolvedValue(snapshot);
  expect((await context.getBackupDataset()).records).toHaveLength(snapshot.records.length);
  expect((await context.getCompleteDataset()).records).toHaveLength(snapshot.records.length);
  expect(cache.getQueryData(referenceKey)).toBe(before);
  expect(page.records).toHaveLength(1);
  expect(context.dataset.records).toEqual([]);
});
