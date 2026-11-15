import { mockWalletData } from "@shared/mock-data";
import { recordCreateSchema } from "@shared/schemas";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createDb } from "../../server/db/client.js";

import type { RecordFilters, WalletDataset } from "@shared/types";
import type { ReactNode } from "react";

import { withWalletMetadata } from "@/test/legacy-wallet-view";
import { RecordsView } from "@/features/records/RecordsView";
const update = vi.hoisted(() => vi.fn());
const add = vi.hoisted(() => vi.fn());
const clearFilters = vi.hoisted(() => vi.fn());
const setAllPeriod = vi.hoisted(() => vi.fn());
const setFilters = vi.hoisted(() => vi.fn());
const openReviewQueue = vi.hoisted(() => vi.fn());
const closeReviewQueue = vi.hoisted(() => vi.fn());
let dataset: WalletDataset;
let filters: RecordFilters;
let periodMode: "month" | "all";
let historyComplete: boolean;
let isReviewQueueOpen: boolean;
let globalReviewCount: number | undefined;
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () =>
    withWalletMetadata({
      dataset,
      selectedMonth: "2020-06",
      selectedPeriodMode: periodMode,
      selectedDateRange:
        periodMode === "all"
          ? { from: "2019-01-01", to: "2026-12-31" }
          : { from: "2020-06-01", to: "2020-06-30" },
      recordFilters: filters,
      setRecordFilters: setFilters,
      clearRecordFilters: clearFilters,
      setAllPeriod,
      openReviewQueue,
      closeReviewQueue,
      isReviewQueueOpen,
      addRecord: add,
      updateRecord: update,
      deleteRecord: vi.fn(),
      newRecordRequestId: 0,
      consumeNewRecordRequest: vi.fn(),
      recordsPage: {},
      isAllHistoryComplete: historyComplete,
      isSelectedRangeComplete: historyComplete,
      loadMoreRecords: vi.fn(),
      ...(globalReviewCount === undefined ? {} : { globalReviewCount }),
    }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (action: () => Promise<unknown>) => action(),
  }),
}));
vi.mock("@/components/ui/dialog", () => {
  const part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <>{children}</> : null,
    DialogContent: part,
    DialogHeader: part,
    DialogTitle: part,
    DialogDescription: part,
  };
});
vi.mock("@radix-ui/react-select", () => {
  const part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return Object.fromEntries(
    [
      "Root",
      "Trigger",
      "Value",
      "Portal",
      "Content",
      "Viewport",
      "Item",
      "ItemText",
      "ItemIndicator",
      "Icon",
      "ScrollUpButton",
      "ScrollDownButton",
    ].map((name) => [name, part]),
  );
});
let tree: ReactTestRenderer | undefined;
const preciseDate = "2020-06-01T12:34:56.789Z";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  update.mockResolvedValue(undefined);
  add.mockResolvedValue(undefined);
  filters = {};
  periodMode = "month";
  historyComplete = true;
  globalReviewCount = undefined;
  isReviewQueueOpen = false;
  clearFilters.mockImplementation(() => {
    isReviewQueueOpen = false;
    filters = {};
  });
  setAllPeriod.mockImplementation(() => {
    periodMode = "all";
  });
  setFilters.mockImplementation((patch: RecordFilters) => {
    filters = { ...filters, ...patch };
  });
  let previous:
    | {
        filters: RecordFilters;
        period: "month" | "all";
      }
    | undefined;
  openReviewQueue.mockImplementation(() => {
    isReviewQueueOpen = true;
    previous ??= { filters: { ...filters }, period: periodMode };
    filters = { paymentStatus: "needs_review" };
    periodMode = "all";
  });
  closeReviewQueue.mockImplementation(() => {
    isReviewQueueOpen = false;
    filters = previous?.filters ?? { ...filters, paymentStatus: "all" };
    periodMode = previous?.period ?? periodMode;
    previous = undefined;
  });
  dataset = structuredClone(mockWalletData);
  dataset.goals = [];
  dataset.creditCards = [
    {
      id: "test-card",
      name: "Card",
      issuer: "Issuer",
      lastFour: "1234",
      creditLimit: 1000,
      limitCurrency: "UYU",
      closingDay: 20,
      dueDay: 5,
      color: "blue",
      icon: "card",
      isActive: true,
    },
  ];
  dataset.records = [
    {
      id: "wallet-record",
      type: "expense",
      amount: 100,
      currency: "UYU",
      accountId: dataset.accounts[0]!.id,
      accountAmount: 100,
      categoryId: dataset.categories[0]!.id,
      creditCardId: "test-card",
      tagIds: [],
      goalIds: [],
      goalAssociations: [],
      paymentType: "credit",
      paymentStatus: "cleared",
      exchangeRateToPrimary: 1,
      amountInLimitCurrency: 100,
      exchangeRateToLimitCurrency: 1,
      occurredAt: preciseDate,
    },
  ];
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function openRecord() {
  await act(async () => {
    tree = create(<RecordsView />);
  });
  await act(async () => tree!.root.findAllByProps({ role: "button" })[0]!.props.onClick());
}
test("the queue toggle opens global review from a manually filtered Needs review view", async () => {
  filters = { accountId: "bank", paymentStatus: "needs_review" };
  await act(async () => {
    tree = create(<RecordsView />);
  });
  expect(tree!.root.findByProps({ "aria-label": "Open review queue" }).props["aria-pressed"]).toBe(
    false,
  );
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Open review queue" }).props.onClick(),
  );
  expect(openReviewQueue).toHaveBeenCalledOnce();
  expect(closeReviewQueue).not.toHaveBeenCalled();
  await act(async () => tree!.update(<RecordsView />));
  expect(tree!.root.findByProps({ "aria-label": "Open review queue" }).props["aria-pressed"]).toBe(
    true,
  );
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Remove Status filter" }).props.onClick(),
  );
  await act(async () => tree!.update(<RecordsView />));
  expect(filters).toEqual({ accountId: "bank", paymentStatus: "needs_review" });
  expect(tree!.root.findByProps({ "aria-label": "Open review queue" }).props["aria-pressed"]).toBe(
    false,
  );
});
test.each(["cleared", "needs_review"] as const)(
  "Status All exits the global queue and restores the previous %s filter",
  async (status) => {
    filters = { accountId: "bank", paymentStatus: status, note: "manual note" };
    const previous = { ...filters };
    await act(async () => {
      tree = create(<RecordsView />);
    });
    await act(async () =>
      tree!.root.findByProps({ "aria-label": "Open review queue" }).props.onClick(),
    );
    await act(async () => tree!.update(<RecordsView />));
    const statusSelect = tree!.root
      .findAllByType("select")
      .find((select) => select.props.value === "needs_review")!;
    await act(async () => statusSelect.props.onChange({ target: { value: "all" } }));
    expect(closeReviewQueue).toHaveBeenCalledOnce();
    expect(filters).toEqual(previous);
    expect(periodMode).toBe("month");
  },
);
test("Note receives focus only when explicitly opened, including after removal", async () => {
  const focus = vi.fn();
  await act(async () => {
    tree = create(<RecordsView />, {
      createNodeMock: (element) => (element.type === "textarea" ? { focus } : null),
    });
  });
  expect(focus).not.toHaveBeenCalled();
  const addNote = () =>
    tree!.root
      .findAllByType("button")
      .find((button) =>
        button.children.some((child) => typeof child === "string" && child.includes("Add filter")),
      )!;
  await act(async () => addNote().props.onClick());
  expect(focus).toHaveBeenCalledTimes(1);
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Paste part of a note" })
      .props.onChange({ target: { value: "lunch" } }),
  );
  await act(async () => tree!.update(<RecordsView />));
  expect(focus).toHaveBeenCalledTimes(1);
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Remove Note filter" }).props.onClick(),
  );
  await act(async () => tree!.update(<RecordsView />));
  await act(async () => addNote().props.onClick());
  expect(focus).toHaveBeenCalledTimes(2);
});
test("an existing Note filter on mount does not steal focus", async () => {
  filters = { note: "existing" };
  const focus = vi.fn();
  await act(async () => {
    tree = create(<RecordsView />, { createNodeMock: () => ({ focus }) });
  });
  expect(focus).not.toHaveBeenCalled();
});
test("dismissing the review status chip uses the same return action as the toggle", async () => {
  await act(async () => {
    tree = create(<RecordsView />);
  });
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Open review queue" }).props.onClick(),
  );
  await act(async () => tree!.update(<RecordsView />));
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Remove Status filter" }).props.onClick(),
  );
  expect(closeReviewQueue).toHaveBeenCalledOnce();
});
test("removing a card sends JSON null and preserves an unchanged precise timestamp", async () => {
  await openRecord();
  const paymentType = tree!.root
    .findAllByType("select")
    .find((select) => select.props.value === "card:test-card")!;
  await act(async () => paymentType.props.onChange({ target: { value: "debit" } }));
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0]![1]).toMatchObject({
    creditCardId: null,
    occurredAt: preciseDate,
  });
});
test("bank-refund editing locks financial inputs and submits only metadata", async () => {
  dataset.records[0] = {
    ...dataset.records[0]!,
    type: "income",
    amount: 40,
    accountAmount: 40,
    amountInLimitCurrency: 100,
  };
  dataset.creditCardRecords = [
    {
      id: "refund",
      creditCardId: "test-card",
      walletRecordId: "wallet-record",
      originalRecordId: "original",
      kind: "refund",
      amount: 100,
      currency: "UYU",
      amountInLimitCurrency: 100,
      exchangeRateToLimitCurrency: 1,
      categoryId: dataset.categories[0]!.id,
      accountId: dataset.accounts[0]!.id,
      accountAmount: 40,
      accountImpactAtCreation: true,
      occurredAt: preciseDate,
    },
  ];
  await openRecord();
  expect(
    tree!.root.findAllByType("input").find((input) => input.props.type === "number")!.props
      .disabled,
  ).toBe(true);
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Optional description" })
      .props.onChange({ target: { value: "Confirmed" } }),
  );
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  const payload = update.mock.calls[0]![1];
  expect(payload.note).toBe("Confirmed");
  for (const key of [
    "amount",
    "currency",
    "accountId",
    "accountAmount",
    "creditCardId",
    "paymentStatus",
    "occurredAt",
    "amountInLimitCurrency",
  ])
    expect(payload).not.toHaveProperty(key);
});
test("new income and transfers cannot select a credit card", async () => {
  await act(async () => {
    tree = create(<RecordsView />);
  });
  const newButton = tree!.root
    .findAllByType("button")
    .find((button) => button.children.includes("New"))!;
  await act(async () => newButton.props.onClick());
  for (const label of ["Income", "Transfer"]) {
    const typeButton = tree!.root
      .findAllByType("button")
      .find((button) => button.children.includes(label))!;
    await act(async () => typeButton.props.onClick());
    expect(
      tree!.root
        .findAllByType("option")
        .filter((option) => String(option.props.value).startsWith("card:")),
    ).toHaveLength(0);
  }
});
test("clicking the active review queue again restores the previous period and filters", async () => {
  dataset.records.push({
    ...dataset.records[0]!,
    id: "review-old",
    occurredAt: "2019-01-01T12:00:00Z",
    paymentStatus: "needs_review",
  });
  await act(async () => {
    tree = create(<RecordsView />);
  });
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Open review queue" }).props.onClick(),
  );
  await act(async () => tree!.update(<RecordsView />));
  expect(tree!.root.findAllByProps({ role: "button" })).toHaveLength(1);
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Open review queue" }).props.onClick(),
  );
  await act(async () => tree!.update(<RecordsView />));
  expect(filters).toEqual({});
  expect(periodMode).toBe("month");
  expect(tree!.root.findAllByProps({ role: "button" })).toHaveLength(1);
});
test("a default foreign credit card starts in its limit currency rather than the bank currency", async () => {
  dataset.settings.defaultPaymentType = "credit";
  dataset.settings.defaultCreditCardId = "test-card";
  dataset.creditCards[0]!.limitCurrency = "USD";
  dataset.accounts[0]!.currency = "UYU";
  dataset.settings.primaryAccountId = dataset.accounts[0]!.id;
  await act(async () => {
    tree = create(<RecordsView />);
  });
  await act(async () =>
    tree!.root
      .findAllByType("button")
      .find((button) => button.children.includes("New"))!
      .props.onClick(),
  );
  const currency = tree!.root
    .findAllByType("select")
    .find((select) =>
      select.findAllByType("option").some((option) => option.children.includes("BRL")),
    )!;
  expect(currency.props.value).toBe("USD");
});
test("an unknown-bank purchase can be resolved as card-only without a bank account", async () => {
  dataset.records[0] = {
    ...dataset.records[0]!,
    accountId: undefined,
    accountAmount: undefined,
    creditCardId: undefined,
    amountInLimitCurrency: undefined,
    exchangeRateToLimitCurrency: undefined,
    paymentStatus: "needs_review",
  };
  await openRecord();
  const paymentType = tree!.root
    .findAllByType("select")
    .find((select) =>
      select.findAllByType("option").some((option) => option.props.value === "card:test-card"),
    )!;
  await act(async () => paymentType.props.onChange({ target: { value: "card:test-card" } }));
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Set status to Cleared" }).props.onClick(),
  );
  expect(
    tree!.root.findAllByType("button").find((button) => button.props.type === "submit")!.props
      .disabled,
  ).toBe(false);
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(update.mock.calls[0]![1]).toMatchObject({
    creditCardId: "test-card",
    paymentStatus: "cleared",
  });
  expect(update.mock.calls[0]![1].accountId).toBeUndefined();
});
test("an unresolved review record can be cancelled without inventing destinations or FX", async () => {
  dataset.records[0] = {
    ...dataset.records[0]!,
    currency: "EUR",
    accountId: undefined,
    accountAmount: undefined,
    creditCardId: undefined,
    amountInLimitCurrency: undefined,
    exchangeRateToLimitCurrency: undefined,
    categoryId: undefined,
    paymentStatus: "needs_review",
    exchangeRateToPrimary: 0,
  };
  dataset.exchangeRates = [];
  const original = structuredClone(dataset.records[0]);
  await openRecord();
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Set status to Cancelled" }).props.onClick(),
  );
  expect(
    tree!.root.findAllByType("button").find((button) => button.props.type === "submit")!.props
      .disabled,
  ).toBe(false);
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(update).toHaveBeenCalledExactlyOnceWith("wallet-record", {
    paymentStatus: "cancelled",
  });
  expect(dataset.records[0]).toEqual(original);
});
test("review queue clears incompatible filters and includes drafts outside the selected month", async () => {
  dataset.records.push({
    ...dataset.records[0]!,
    id: "old-draft",
    occurredAt: "2019-01-01T12:00:00Z",
    paymentStatus: "needs_review",
    counterpartyName: "Old review merchant",
  });
  filters = {
    search: "unrelated",
    accountId: "other-account",
    paymentStatus: "cleared",
  };
  await act(async () => {
    tree = create(<RecordsView />);
  });
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Open review queue" }).props.onClick(),
  );
  await act(async () => tree!.update(<RecordsView />));
  expect(openReviewQueue).toHaveBeenCalledOnce();
  expect(filters).toEqual({ paymentStatus: "needs_review" });
  expect(tree!.root.findAllByProps({ role: "button" })).toHaveLength(1);
  expect(JSON.stringify(tree!.toJSON())).toContain("Old review merchant");
});
test("review count uses complete reference metadata independently of the loaded record page", async () => {
  historyComplete = false;
  globalReviewCount = 41;
  await act(async () => {
    tree = create(<RecordsView />);
  });
  expect(
    JSON.stringify(tree!.root.findByProps({ "aria-label": "Open review queue" }).props.children),
  ).toContain("41");
});
test("duplicating opens a fresh draft and writes only once on submit with current conversions", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111",
    categoryId = "22222222-2222-4222-8222-222222222222",
    tagId = "33333333-3333-4333-8333-333333333333";
  dataset.accounts[0]!.id = accountId;
  dataset.categories[0]!.id = categoryId;
  dataset.records[0] = {
    ...dataset.records[0]!,
    accountId,
    categoryId,
    currency: "USD",
    creditCardId: undefined,
    paymentType: "debit",
    amount: 100,
    accountAmount: 3900,
    exchangeRateToPrimary: 39,
    debtId: "old-debt",
    goalIds: ["old-goal"],
    goalAssociations: [
      {
        goalId: "old-goal",
        assignmentSource: "manual",
        useReserved: true,
        reserveIncome: true,
      },
    ],
    tagIds: [tagId, "44444444-4444-4444-8444-444444444444"],
    counterpartyName: "Repeat shop",
    note: "Template note",
  };
  dataset.accounts[0]!.currency = "UYU";
  dataset.settings.primaryCurrency = "UYU";
  dataset.exchangeRates = [
    {
      id: "current-rate",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 42,
      date: "2026-01-01T12:00:00Z",
    },
  ];
  const original = structuredClone(dataset.records[0]);
  await openRecord();
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Duplicate record" }).props.onClick(),
  );
  expect(add).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  let finish!: () => void;
  add.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    const submit = tree!.root.findByType("form").props.onSubmit;
    const first = submit({ preventDefault() {} }),
      second = submit({ preventDefault() {} });
    finish();
    await Promise.all([first, second]);
  });
  expect(add).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
  const payload = add.mock.calls[0]![0];
  expect(payload).toMatchObject({
    amount: 100,
    currency: "USD",
    accountAmount: 4200,
    exchangeRateToPrimary: 42,
    tagIds: [tagId],
    counterpartyName: "Repeat shop",
    note: "Template note",
    goalIds: [],
  });
  expect(recordCreateSchema.safeParse(payload).success).toBe(true);
  expect(payload.occurredAt.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  for (const key of ["id", "debtId", "idempotencyKey", "requestHash"])
    expect(payload).not.toHaveProperty(key);
  expect(dataset.records[0]).toEqual(original);
});
test("duplicate with no current quote stays editable and sends no write", async () => {
  dataset.records[0] = {
    ...dataset.records[0]!,
    currency: "EUR",
    creditCardId: undefined,
    paymentType: "debit",
    exchangeRateToPrimary: 50,
    accountAmount: 5000,
  };
  dataset.exchangeRates = [];
  dataset.settings.primaryCurrency = "UYU";
  dataset.accounts[0]!.currency = "UYU";
  await openRecord();
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Duplicate record" }).props.onClick(),
  );
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(add).not.toHaveBeenCalled();
  expect(tree!.root.findByProps({ role: "alert" })).toBeDefined();
});
test("duplicate does not reuse inactive cards or accounts and retains its form after a failed save", async () => {
  dataset.creditCards[0]!.isActive = false;
  dataset.accounts[0]!.isActive = false;
  await openRecord();
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Duplicate record" }).props.onClick(),
  );
  const accountSelect = tree!.root
    .findAllByType("select")
    .find((select) =>
      select
        .findAllByType("option")
        .some((option) => option.props.value === dataset.accounts[1]!.id),
    )!;
  expect(accountSelect.props.value).not.toBe(dataset.accounts[0]!.id);
  expect(
    tree!.root.findAllByType("select").some((select) => select.props.value === "card:test-card"),
  ).toBe(false);
  await act(async () =>
    accountSelect.props.onChange({ target: { value: dataset.accounts[1]!.id } }),
  );
  add.mockRejectedValue(new Error("Offline"));
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(add).toHaveBeenCalledOnce();
  expect(tree!.root.findByType("form")).toBeDefined();
});
test("a submitted duplicate persists as a separate record after a canonical reload", async () => {
  const { createPostgresTestDatabase } = await import("../../scripts/sandbox/postgres-test");
  const { createRecord, getWalletDataset } = await import("../../server/db/index");
  const { randomUUID } = await import("node:crypto");
  const fixture = await createPostgresTestDatabase();
  try {
    const accountId = randomUUID(),
      categoryId = randomUUID(),
      sourceId = randomUUID();
    await fixture.pool.query(
      "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Duplicate test','bank','UYU',10000,'blue','bank')",
      [accountId],
    );
    await fixture.pool.query(
      "INSERT INTO categories(id,name,color,icon) VALUES($1,'Duplicate test','blue','bank')",
      [categoryId],
    );
    await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
    await fixture.pool.query(
      "INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',42,'2026-01-01')",
    );
    await fixture.pool.query(
      "INSERT INTO records(id,type,amount,currency,account_id,account_amount,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,debt_id) VALUES($1,'expense',100,'USD',$2,3900,$3,'debit','cleared',39,'2020-06-01T12:00:00Z',$4)",
      [sourceId, accountId, categoryId, randomUUID()],
    );
    dataset = await getWalletDataset(createDb());
    const original = structuredClone(dataset.records[0]!);
    add.mockImplementation((input) => createRecord(createDb(), input));
    await openRecord();
    await act(async () =>
      tree!.root.findByProps({ "aria-label": "Duplicate record" }).props.onClick(),
    );
    expect((await getWalletDataset(createDb())).records).toHaveLength(1);
    await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    const reloaded = await getWalletDataset(createDb());
    expect(reloaded.records).toHaveLength(2);
    expect(reloaded.records.find((record) => record.id === sourceId)!).toEqual(original);
    expect(reloaded.records.find((record) => record.id !== sourceId)!).toMatchObject({
      amount: 100,
      currency: "USD",
      accountAmount: 4200,
      exchangeRateToPrimary: 42,
      debtId: undefined,
    });
  } finally {
    await fixture.close();
  }
}, 60000);
test("editing a bank-backed purchase cannot select Card only", async () => {
  await openRecord();
  expect(
    tree!.root.findAllByType("option").filter((option) => option.children.includes("Card only")),
  ).toHaveLength(0);
});
test("editing an existing card-only purchase retains Card only", async () => {
  dataset.records[0]!.accountId = undefined;
  dataset.records[0]!.accountAmount = undefined;
  await openRecord();
  expect(
    tree!.root.findAllByType("option").filter((option) => option.children.includes("Card only")),
  ).toHaveLength(1);
});

vi.mock("@/hooks/wallet-entities", async () => {
  const { legacyEntityHooks } = await import("@/test/legacy-wallet-view");
  const { useWallet } = await import("@/providers/wallet-provider");
  return legacyEntityHooks(useWallet);
});
