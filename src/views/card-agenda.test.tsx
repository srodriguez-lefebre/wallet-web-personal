import { mockWalletData } from "@shared/mock-data";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LimitUsageAlert } from "../components/wallet/limit-usage-alert";
import { CardDetailView } from "./card-detail-view";
import { CardsView } from "./cards-view";

import type { ReactNode } from "react";

import { createActionToastRunner } from "@/lib/action-toast-runner";
import { withWalletMetadata } from "@/test/legacy-wallet-view";

let dataset = structuredClone(mockWalletData);
const refreshStatements = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const payment = vi.hoisted(() => vi.fn());
const updateMovement = vi.hoisted(() => vi.fn());
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () =>
    withWalletMetadata({
      dataset,
      refreshCardStatements: refreshStatements,
      isAllHistoryComplete: true,
      payCreditCardStatement: payment,
      updateCreditCardRecord: updateMovement,
      selectedMonth: "2026-11",
      selectedPeriodMode: "month",
      selectedDateRange: { from: "2026-11-01", to: "2026-11-30" },
    }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: createActionToastRunner(() => {}),
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
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  dataset = structuredClone(mockWalletData);
  dataset.creditCards = [
    {
      id: "card",
      name: "Archived card",
      issuer: "Bank",
      lastFour: "1234",
      creditLimit: 1000,
      limitCurrency: "USD",
      closingDay: 20,
      dueDay: 5,
      color: "blue",
      icon: "card",
      isActive: false,
    },
  ];
  dataset.creditCardStatements = ["later", "oldest"].map((id, index) => ({
    id,
    creditCardId: "card",
    cycleStart: "2020-01-01",
    cycleEnd: "2020-01-31",
    dueAt: index === 0 ? "2020-03-01" : "2020-02-01",
    closedAt: "2020-02-01",
    status: "paid",
  }));
  dataset.creditCardRecords = dataset.creditCardStatements.map((statement, index) => ({
    id: `purchase-${statement.id}`,
    creditCardId: "card",
    statementId: statement.id,
    kind: "purchase",
    amount: (index + 1) * 100,
    currency: "USD",
    amountInLimitCurrency: (index + 1) * 100,
    exchangeRateToLimitCurrency: 1,
    categoryId: dataset.categories[0]!.id,
    accountImpactAtCreation: false,
    occurredAt: "2020-01-10",
  }));
  dataset.creditCardPayments = [];
  dataset.creditCardPaymentAllocations = [];
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function detail(query = "") {
  await act(async () => {
    tree = create(
      <MemoryRouter initialEntries={[`/cards/card${query}`]}>
        <Routes>
          <Route path="/cards/:cardId" element={<CardDetailView />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

test("navigating to another card discards the previous card's movement draft", async () => {
  dataset.creditCards.push({
    ...dataset.creditCards[0]!,
    id: "second-card",
    name: "Synthetic second card",
  });
  function NextCard() {
    const navigate = useNavigate();
    return (
      <button data-next-card onClick={() => void navigate("/cards/second-card")}>
        Next card
      </button>
    );
  }
  await act(async () => {
    tree = create(
      <MemoryRouter initialEntries={["/cards/card"]}>
        <NextCard />
        <Routes>
          <Route path="/cards/:cardId" element={<CardDetailView />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () =>
    tree!.root
      .findAllByType("button")
      .find((button) =>
        button.children.some(
          (child) => typeof child === "string" && child.includes("Add movement"),
        ),
      )!
      .props.onClick(),
  );
  const movement = () =>
    tree!.root
      .findAllByType("form")
      .find((form) => form.props.className === "grid gap-4 md:grid-cols-3");
  expect(movement()).toBeDefined();
  await act(async () =>
    movement()!
      .findAllByType("input")[0]!
      .props.onChange({ target: { value: "77" } }),
  );
  await act(async () => tree!.root.findByProps({ "data-next-card": true }).props.onClick());
  expect(movement()).toBeUndefined();
  expect(updateMovement).not.toHaveBeenCalled();
});

test("purchase and payment history use Uruguay's local day and preserve calendar dates", async () => {
  vi.stubEnv("TZ", "America/Montevideo");
  dataset.creditCardRecords[0]!.occurredAt = "2026-11-13T02:38:00Z";
  dataset.creditCardRecords[1]!.occurredAt = "2026-11-13";
  dataset.creditCardPayments = [
    {
      id: "night-payment",
      creditCardId: "card",
      amount: 1,
      currency: "USD",
      amountInLimitCurrency: 1,
      occurredAt: "2026-11-13T02:38:00Z",
    },
  ];
  await detail();
  const dates = tree!.root
    .findAllByType("p")
    .map((p) => p.children.filter((c) => typeof c === "string").join(""));
  expect(dates.filter((text) => text.startsWith("12/11/2026"))).toHaveLength(2);
  expect(dates.filter((text) => text.startsWith("13/11/2026"))).toHaveLength(1);
});

test("Cards distinguishes the open cycle from actual closed statement debt", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  dataset.creditCards[0]!.closingDay = 3;
  dataset.creditCards[0]!.dueDay = 12;
  dataset.creditCardStatements = [];
  dataset.creditCardRecords = [];
  await act(async () => {
    tree = create(
      <MemoryRouter>
        <CardsView />
      </MemoryRouter>,
    );
  });
  let output = JSON.stringify(tree!.toJSON());
  expect(output).toContain("Current cycle");
  expect(output).toContain("3 December 2026");
  expect(output).toContain("No closed statement pending");
  expect(output).not.toContain("12 November 2026");
  dataset = {
    ...dataset,
    creditCardStatements: [
      {
        id: "unpaid",
        creditCardId: "card",
        cycleStart: "2026-10-04",
        cycleEnd: "2026-11-03",
        closedAt: "2026-11-03",
        dueAt: "2026-11-12",
        status: "paid",
      },
    ],
    creditCardRecords: [
      {
        id: "unpaid-purchase",
        creditCardId: "card",
        statementId: "unpaid",
        kind: "purchase",
        amount: 100,
        currency: "USD",
        amountInLimitCurrency: 100,
        exchangeRateToLimitCurrency: 1,
        categoryId: dataset.categories[0]!.id,
        accountImpactAtCreation: false,
        occurredAt: "2026-10-20",
      },
    ],
  };
  await act(async () =>
    tree!.update(
      <MemoryRouter>
        <CardsView />
      </MemoryRouter>,
    ),
  );
  output = JSON.stringify(tree!.toJSON());
  expect(output).toContain("Statement closed");
  expect(output).toContain("3 November 2026");
  expect(output).toContain("12 November 2026");
  expect(output).toContain("Overdue");
  expect(output).not.toContain("No closed statement pending");
});

test.each(["2026-11-13T02:38:00.123Z", "2026-11-13"])(
  "editing a movement preserves an unchanged original date: %s",
  async (occurredAt) => {
    vi.stubEnv("TZ", "America/Montevideo");
    dataset.creditCardRecords = [{ ...dataset.creditCardRecords[0]!, occurredAt }];
    dataset.creditCardStatements = [];
    await detail();
    await act(async () => tree!.root.findByProps({ title: "Edit" }).props.onClick());
    expect(tree!.root.findByProps({ type: "date" }).props.value).toBe(
      occurredAt.includes("T") ? "2026-11-12" : "2026-11-13",
    );
    await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(updateMovement.mock.calls[0]![2].occurredAt).toBe(occurredAt);
  },
);
test("detail defaults to the oldest actual debt and honors the exact statement query", async () => {
  await detail();
  expect(tree!.root.findByProps({ "aria-label": "Select statement" }).props.value).toBe("oldest");
  await act(async () => tree!.unmount());
  tree = undefined;
  await detail("?statementId=later");
  expect(tree!.root.findByProps({ "aria-label": "Select statement" }).props.value).toBe("later");
});
test("changing a statement updates the query selection and clears the previous payment amount", async () => {
  await detail("?statementId=later");
  const amount = tree!.root
    .findAllByType("input")
    .find((input) => input.props.placeholder === "Amount in USD")!;
  await act(async () => amount.props.onChange({ target: { value: "50" } }));
  const bank = tree!.root
    .findAllByType("select")
    .find((select) =>
      select.findAllByType("option").some((option) => option.children.includes("External payment")),
    )!;
  await act(async () => bank.props.onChange({ target: { value: dataset.accounts[0]!.id } }));
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Amount debited" })
      .props.onChange({ target: { value: "2000" } }),
  );
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Select statement" })
      .props.onChange({ target: { value: "oldest" } }),
  );
  expect(tree!.root.findByProps({ "aria-label": "Select statement" }).props.value).toBe("oldest");
  expect(
    tree!.root.findAllByType("input").find((input) => input.props.placeholder === "Amount in USD")!
      .props.value,
  ).toBe("");
  expect(tree!.root.findByProps({ placeholder: "Amount debited" }).props.value).toBe("");
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Amount in USD" })
      .props.onChange({ target: { value: "10" } }),
  );
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(payment).not.toHaveBeenCalled();
});
test("limit alert is absent below eighty and visible at eighty and one hundred", async () => {
  await act(async () => {
    tree = create(<LimitUsageAlert utilizationPercent={79.99} />);
  });
  expect(tree!.toJSON()).toBeNull();
  await act(async () => tree!.update(<LimitUsageAlert utilizationPercent={80} />));
  expect(JSON.stringify(tree!.toJSON())).toContain("Approaching credit limit");
  await act(async () => tree!.update(<LimitUsageAlert utilizationPercent={100} />));
  expect(JSON.stringify(tree!.toJSON())).toContain("Credit limit reached");
});

test("paying from a statement link submits the exact selected statement", async () => {
  payment.mockResolvedValue(undefined);
  await detail("?statementId=later");
  await act(async () =>
    tree!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Full"))!
      .props.onClick(),
  );
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(payment).toHaveBeenCalledTimes(1);
  expect(payment.mock.calls[0]!.slice(0, 2)).toEqual(["card", "later"]);
  expect(payment.mock.calls[0]![2]).toMatchObject({
    amount: 100,
    currency: "USD",
    amountInLimitCurrency: 100,
  });
});

test("a settled statement link remains inspectable without a payment form", async () => {
  dataset.creditCardPayments = [
    {
      id: "paid",
      creditCardId: "card",
      statementId: "later",
      amount: 100,
      currency: "USD",
      amountInLimitCurrency: 100,
      occurredAt: "2020-03-02",
    },
  ];
  await detail("?statementId=later");
  expect(tree!.root.findByProps({ "aria-label": "Select statement" }).props.value).toBe("later");
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain("Settled");
});

test("opening Cards refreshes statements once without repeating after a render", async () => {
  await act(async () => {
    tree = create(
      <MemoryRouter>
        <CardsView />
      </MemoryRouter>,
    );
  });
  expect(refreshStatements).toHaveBeenCalledTimes(1);
  await act(async () => {
    tree!.update(
      <MemoryRouter>
        <CardsView />
      </MemoryRouter>,
    );
  });
  expect(refreshStatements).toHaveBeenCalledTimes(1);
});

vi.mock("@/hooks/wallet-entities", async () => {
  const { legacyEntityHooks } = await import("@/test/legacy-wallet-view");
  const { useWallet } = await import("@/providers/wallet-provider");
  return legacyEntityHooks(useWallet);
});

vi.mock("@/features/cards/use-card-reads", async () => {
  const { legacyCardReads } = await import("@/test/legacy-wallet-view");
  const { useWallet } = await import("@/providers/wallet-provider");
  return legacyCardReads(useWallet);
});
