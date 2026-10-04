import type { PropsWithChildren } from "react";
import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestInstance,
} from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { WalletDataset } from "../../shared/types";
import { RecordsView } from "./records-view";

const update = vi.hoisted(() => vi.fn());
let dataset: WalletDataset;
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset,
    selectedMonth: "2026-02",
    selectedPeriodMode: "month",
    selectedDateRange: { from: "2026-02-01", to: "2026-02-28" },
    recordFilters: {},
    setRecordFilters: vi.fn(),
    clearRecordFilters: vi.fn(),
    addRecord: vi.fn(),
    updateRecord: update,
    deleteRecord: vi.fn(),
    newRecordRequestId: 0,
    consumeNewRecordRequest: vi.fn(),
    recordsPage: {},
    isSelectedRangeComplete: true,
    loadMoreRecords: vi.fn(),
  }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (action: () => Promise<unknown>) => action(),
  }),
}));
vi.mock("@/components/wallet/category-picker", () => ({
  CategoryPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      aria-label="Category"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("@/components/ui/dialog", () => {
  const Part = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
      open ? <div>{children}</div> : null,
    DialogContent: Part,
    DialogDescription: Part,
    DialogHeader: Part,
    DialogTitle: Part,
  };
});
vi.mock("@radix-ui/react-select", () => {
  const Part = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return Object.fromEntries(
    [
      "Root",
      "Trigger",
      "Value",
      "Icon",
      "Portal",
      "Content",
      "Viewport",
      "Item",
      "ItemText",
      "ItemIndicator",
    ].map((name) => [name, Part]),
  );
});
let tree: ReactTestRenderer | undefined;
const date = "2026-02-01T12:34:56.789Z";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  update.mockReset().mockResolvedValue(undefined);
  dataset = structuredClone(mockWalletData);
  dataset.goals = [];
  dataset.exchangeRates = [];
  dataset.settings.primaryCurrency = "UYU";
  dataset.accounts[0].currency = "UYU";
  dataset.records = [
    {
      ...dataset.records[0],
      type: "expense",
      amount: 100,
      currency: "EUR",
      accountId: dataset.accounts[0].id,
      accountAmount: 4500,
      creditCardId: undefined,
      paymentType: "debit",
      paymentStatus: "needs_review",
      exchangeRateToPrimary: 0,
      occurredAt: date,
      tagIds: [],
      goalIds: [],
      goalAssociations: [],
    },
  ];
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () => {
    tree = create(<RecordsView />);
  });
  await act(async () =>
    tree!.root.findByProps({ role: "button", tabIndex: 0 }).props.onClick(),
  );
}
async function change(field: ReactTestInstance, value: string) {
  await act(async () => field.props.onChange({ target: { value } }));
}
async function submit() {
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
}
function rate() {
  return tree!.root
    .findAllByType("input")
    .find((input) => input.props.value === "0")!;
}
async function clearStatus() {
  await act(async () => tree!.root.findByProps({ "aria-label": "Set status to Cleared" }).props.onClick());
}

test.each([false, true])(
  "editing a review note preserves unresolved FX even if a quote now exists (%s)",
  async (quoteExists) => {
    if (quoteExists)
      dataset.exchangeRates = [
        {
          id: "now-known",
          fromCurrency: "EUR",
          toCurrency: "UYU",
          rate: 50,
          date: "2026-01-01T12:00:00Z",
        },
      ];
    await open();
    await change(
      tree!.root.findByProps({ placeholder: "Optional description" }),
      "Reviewed merchant note",
    );
    await submit();
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][1];
    expect(payload.note).toBe("Reviewed merchant note");
    for (const key of [
      "exchangeRateToPrimary",
      "amount",
      "currency",
      "accountId",
      "accountAmount",
      "creditCardId",
      "exchangeRateToLimitCurrency",
      "amountInLimitCurrency",
      "paymentStatus",
      "occurredAt",
    ])
      expect(payload).not.toHaveProperty(key);
  },
);

test("review metadata can be saved while the imported account and category remain unknown", async () => {
  dataset.records[0].accountId = undefined;
  dataset.records[0].accountAmount = undefined;
  dataset.records[0].categoryId = undefined;
  await open();
  await change(
    tree!.root.findByProps({ placeholder: "Optional description" }),
    "Bank to identify",
  );
  expect(
    tree!.root
      .findAllByType("button")
      .find((button) => button.props.type === "submit")!.props.disabled,
  ).toBe(false);
  await submit();
  expect(update.mock.calls[0][1]).toMatchObject({
    note: "Bank to identify",
    categoryId: null,
  });
});

test("editing the review category keeps unknown FX and all financial fields out of the patch", async () => {
  await open();
  await change(
    tree!.root.findByType("form").findByProps({ "aria-label": "Category" }),
    dataset.categories[1].id,
  );
  await submit();
  expect(update.mock.calls[0][1]).toEqual({
    categoryId: dataset.categories[1].id,
    counterpartyName: "Pago Amigo",
    note: "Ingreso mensual",
    tagIds: [],
  });
});

test.each(["0", "-1", "Infinity"])(
  "clearing review requires a positive finite primary rate (%s)",
  async (value) => {
    await open();
    await change(rate(), value);
    await clearStatus();
    await submit();
    expect(update).not.toHaveBeenCalled();
  },
);

test("clearing with a valid primary rate preserves the recorded bank conversion", async () => {
  await open();
  await change(rate(), "50");
  await clearStatus();
  await submit();
  expect(update.mock.calls[0][1]).toMatchObject({
    exchangeRateToPrimary: 50,
    accountAmount: 4500,
    paymentStatus: "cleared",
    occurredAt: date,
  });
});

test.each([
  "amount",
  "bank amount",
  "date",
  "type",
  "currency",
  "payment type",
  "primary rate",
])("changing %s cannot bypass missing FX as a metadata edit", async (field) => {
  await open();
  if (field === "amount")
    await change(
      tree!.root
        .findAllByType("input")
        .find((input) => input.props.type === "number")!,
      "200",
    );
  if (field === "bank amount")
    await change(
      tree!.root
        .findAllByType("input")
        .find((input) => input.props.value === "4500")!,
      "4600",
    );
  if (field === "date")
    await change(
      tree!.root.findByProps({ type: "datetime-local" }),
      "2026-02-02T12:34",
    );
  if (field === "type")
    await act(async () =>
      tree!.root
        .findAllByType("button")
        .find((button) => button.children.includes("Income"))!
        .props.onClick(),
    );
  if (field === "currency")
    await change(
      tree!.root
        .findAllByType("select")
        .find((select) => select.props.value === "EUR")!,
      "USD",
    );
  if (field === "primary rate") await change(rate(), "");
  if (field === "payment type") {
    await change(
      tree!.root
        .findAllByType("select")
        .find((select) => select.props.value === "debit")!,
      "cash",
    );
    await change(
      tree!.root
        .findAllByType("select")
        .find((select) => select.props.value === "UYU")!,
      "EUR",
    );
  }
  await submit();
  expect(update).not.toHaveBeenCalled();
});

test("a valid primary rate does not replace a missing bank conversion after switching accounts", async () => {
  dataset.accounts[1].currency = "BRL";
  await open();
  await change(rate(), "50");
  await change(
    tree!.root
      .findAllByType("select")
      .find((select) => select.props.value === dataset.accounts[0].id)!,
    dataset.accounts[1].id,
  );
  await submit();
  expect(update).not.toHaveBeenCalled();
});

test("a valid primary rate does not replace a missing card-limit conversion", async () => {
  dataset.creditCards = [
    {
      id: "new-card",
      name: "USD card",
      issuer: "Bank",
      lastFour: "1234",
      creditLimit: 1000,
      limitCurrency: "USD",
      closingDay: 20,
      dueDay: 5,
      color: "blue",
      icon: "card",
      isActive: true,
    },
  ];
  await open();
  await change(rate(), "50");
  await change(
    tree!.root
      .findAllByType("select")
      .find((select) => select.props.value === "debit")!,
    "card:new-card",
  );
  await submit();
  expect(update).not.toHaveBeenCalled();
});

test("changing an existing card's frozen conversion requires primary FX", async () => {
  dataset.creditCards = [
    {
      id: "existing-card",
      name: "Card",
      issuer: "Bank",
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
  Object.assign(dataset.records[0], {
    creditCardId: "existing-card",
    paymentType: "credit",
    amountInLimitCurrency: 100,
    exchangeRateToLimitCurrency: 1,
  });
  await open();
  const limitRate = tree!.root
    .findAllByType("label")
    .find((label) => label.children.includes("Exchange rate to card limit currency"))!
    .findByType("input");
  await change(limitRate, "2");
  await submit();
  expect(update).not.toHaveBeenCalled();
});

test("changing goal allocations requires primary FX", async () => {
  dataset.goals = [structuredClone(mockWalletData.goals[0])];
  await open();
  await act(async () =>
    tree!.root
      .findAllByType("button")
      .find((button) => button.children.includes(dataset.goals[0].name))!
      .props.onClick(),
  );
  await submit();
  expect(update).not.toHaveBeenCalled();
});
