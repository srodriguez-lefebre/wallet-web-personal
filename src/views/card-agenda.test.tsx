import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { mockWalletData } from "../../shared/mock-data";
import { CardDetailView } from "./card-detail-view";
import { LimitUsageAlert } from "../components/wallet/limit-usage-alert";

let dataset = structuredClone(mockWalletData);
const payment = vi.hoisted(() => vi.fn());
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset,
    isAllHistoryComplete: true,
    payCreditCardStatement: payment,
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
  dataset.creditCardRecords = dataset.creditCardStatements.map(
    (statement, index) => ({
      id: `purchase-${statement.id}`,
      creditCardId: "card",
      statementId: statement.id,
      kind: "purchase",
      amount: (index + 1) * 100,
      currency: "USD",
      amountInLimitCurrency: (index + 1) * 100,
      exchangeRateToLimitCurrency: 1,
      categoryId: dataset.categories[0].id,
      accountImpactAtCreation: false,
      occurredAt: "2020-01-10",
    }),
  );
  dataset.creditCardPayments = [];
  dataset.creditCardPaymentAllocations = [];
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
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
test("detail defaults to the oldest actual debt and honors the exact statement query", async () => {
  await detail();
  expect(
    tree!.root.findByProps({ "aria-label": "Select statement" }).props.value,
  ).toBe("oldest");
  await act(async () => tree!.unmount());
  tree = undefined;
  await detail("?statementId=later");
  expect(
    tree!.root.findByProps({ "aria-label": "Select statement" }).props.value,
  ).toBe("later");
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
      select
        .findAllByType("option")
        .some((option) => option.children.includes("External payment")),
    )!;
  await act(async () =>
    bank.props.onChange({ target: { value: dataset.accounts[0].id } }),
  );
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
  expect(
    tree!.root.findByProps({ "aria-label": "Select statement" }).props.value,
  ).toBe("oldest");
  expect(
    tree!.root
      .findAllByType("input")
      .find((input) => input.props.placeholder === "Amount in USD")!.props
      .value,
  ).toBe("");
  expect(
    tree!.root.findByProps({ placeholder: "Amount debited" }).props.value,
  ).toBe("");
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Amount in USD" })
      .props.onChange({ target: { value: "10" } }),
  );
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(payment).not.toHaveBeenCalled();
});
test("limit alert is absent below eighty and visible at eighty and one hundred", async () => {
  await act(async () => {
    tree = create(<LimitUsageAlert utilizationPercent={79.99} />);
  });
  expect(tree!.toJSON()).toBeNull();
  await act(async () =>
    tree!.update(<LimitUsageAlert utilizationPercent={80} />),
  );
  expect(JSON.stringify(tree!.toJSON())).toContain("Approaching credit limit");
  await act(async () =>
    tree!.update(<LimitUsageAlert utilizationPercent={100} />),
  );
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
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(payment).toHaveBeenCalledTimes(1);
  expect(payment.mock.calls[0].slice(0, 2)).toEqual(["card", "later"]);
  expect(payment.mock.calls[0][2]).toMatchObject({
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
  expect(
    tree!.root.findByProps({ "aria-label": "Select statement" }).props.value,
  ).toBe("later");
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain("Settled");
});
