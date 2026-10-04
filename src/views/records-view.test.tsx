import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { WalletDataset } from "../../shared/types";
import { RecordsView } from "./records-view";

const update = vi.hoisted(() => vi.fn());
let dataset: WalletDataset;
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({ dataset, selectedMonth: "2020-06", selectedPeriodMode: "month", selectedDateRange: { from: "2020-06-01", to: "2020-06-30" }, recordFilters: {}, setRecordFilters: vi.fn(), clearRecordFilters: vi.fn(), addRecord: vi.fn(), updateRecord: update, deleteRecord: vi.fn(), newRecordRequestId: 0, consumeNewRecordRequest: vi.fn(), recordsPage: {}, isSelectedRangeComplete: true, loadMoreRecords: vi.fn() }),
}));
vi.mock("@/lib/use-action-toast", () => ({ useActionToast: () => ({ toast: null, runAction: (action: () => Promise<unknown>) => action() }) }));
vi.mock("@/components/ui/dialog", () => {
  const part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <>{children}</> : null, DialogContent: part, DialogHeader: part, DialogTitle: part, DialogDescription: part };
});
vi.mock("@radix-ui/react-select", () => {
  const part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return Object.fromEntries(["Root", "Trigger", "Value", "Portal", "Content", "Viewport", "Item", "ItemText", "ItemIndicator", "Icon", "ScrollUpButton", "ScrollDownButton"].map(name => [name, part]));
});
let tree: ReactTestRenderer | undefined;
const preciseDate = "2020-06-01T12:34:56.789Z";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  update.mockResolvedValue(undefined);
  dataset = structuredClone(mockWalletData);
  dataset.goals = [];
  dataset.creditCards = [{ id: "test-card", name: "Card", issuer: "Issuer", lastFour: "1234", creditLimit: 1000, limitCurrency: "UYU", closingDay: 20, dueDay: 5, color: "blue", icon: "card", isActive: true }];
  dataset.records = [{ id: "wallet-record", type: "expense", amount: 100, currency: "UYU", accountId: dataset.accounts[0].id, accountAmount: 100, categoryId: dataset.categories[0].id, creditCardId: "test-card", tagIds: [], goalIds: [], goalAssociations: [], paymentType: "credit", paymentStatus: "cleared", exchangeRateToPrimary: 1, amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, occurredAt: preciseDate }];
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function openRecord() {
  await act(async () => { tree = create(<RecordsView />); });
  await act(async () => tree!.root.findAllByProps({ role: "button" })[0].props.onClick());
}

test("removing a card sends JSON null and preserves an unchanged precise timestamp", async () => {
  await openRecord();
  const paymentType = tree!.root.findAllByType("select").find(select => select.props.value === "card:test-card")!;
  await act(async () => paymentType.props.onChange({ target: { value: "debit" } }));
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][1]).toMatchObject({ creditCardId: null, occurredAt: preciseDate });
});

test("bank-refund editing locks financial inputs and submits only metadata", async () => {
  dataset.records[0] = { ...dataset.records[0], type: "income", amount: 40, accountAmount: 40, amountInLimitCurrency: 100 };
  dataset.creditCardRecords = [{ id: "refund", creditCardId: "test-card", walletRecordId: "wallet-record", originalRecordId: "original", kind: "refund", amount: 100, currency: "UYU", amountInLimitCurrency: 100, exchangeRateToLimitCurrency: 1, categoryId: dataset.categories[0].id, accountId: dataset.accounts[0].id, accountAmount: 40, accountImpactAtCreation: true, occurredAt: preciseDate }];
  await openRecord();
  expect(tree!.root.findAllByType("input").find(input => input.props.type === "number")!.props.disabled).toBe(true);
  await act(async () => tree!.root.findByProps({ placeholder: "Optional description" }).props.onChange({ target: { value: "Confirmed" } }));
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  const payload = update.mock.calls[0][1];
  expect(payload.note).toBe("Confirmed");
  for (const key of ["amount", "currency", "accountId", "accountAmount", "creditCardId", "paymentStatus", "occurredAt", "amountInLimitCurrency"]) expect(payload).not.toHaveProperty(key);
});

test("new income and transfers cannot select a credit card", async () => {
  await act(async () => { tree = create(<RecordsView />); });
  const newButton = tree!.root.findAllByType("button").find(button => button.children.includes("New"))!;
  await act(async () => newButton.props.onClick());
  for (const label of ["Income", "Transfer"]) {
    const typeButton = tree!.root.findAllByType("button").find(button => button.children.includes(label))!;
    await act(async () => typeButton.props.onClick());
    expect(tree!.root.findAllByType("option").filter(option => String(option.props.value).startsWith("card:"))).toHaveLength(0);
  }
});


test("a default foreign credit card starts in its limit currency rather than the bank currency", async () => {
  dataset.settings.defaultPaymentType = "credit";
  dataset.settings.defaultCreditCardId = "test-card";
  dataset.creditCards[0].limitCurrency = "USD";
  dataset.accounts[0].currency = "UYU";
  dataset.settings.primaryAccountId = dataset.accounts[0].id;
  await act(async () => { tree = create(<RecordsView />); });
  await act(async () => tree!.root.findAllByType("button").find(button => button.children.includes("New"))!.props.onClick());
  const currency = tree!.root.findAllByType("select").find(select => select.findAllByType("option").some(option => option.children.includes("BRL")))!;
  expect(currency.props.value).toBe("USD");
});

test("an unknown-bank purchase can be resolved as card-only without a bank account", async () => {
  dataset.records[0] = { ...dataset.records[0], accountId: undefined, accountAmount: undefined, creditCardId: undefined, amountInLimitCurrency: undefined, exchangeRateToLimitCurrency: undefined, paymentStatus: "needs_review" };
  await openRecord();
  const paymentType = tree!.root.findAllByType("select").find(select => select.findAllByType("option").some(option => option.props.value === "card:test-card"))!;
  await act(async () => paymentType.props.onChange({ target: { value: "card:test-card" } }));
  const status = tree!.root.findAllByType("select").find(select => select.props.value === "needs_review")!;
  await act(async () => status.props.onChange({ target: { value: "cleared" } }));
  expect(tree!.root.findAllByType("button").find(button => button.props.type === "submit")!.props.disabled).toBe(false);
  await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(update.mock.calls[0][1]).toMatchObject({ creditCardId: "test-card", paymentStatus: "cleared" });
  expect(update.mock.calls[0][1].accountId).toBeUndefined();
});

test("editing a bank-backed purchase cannot select Card only", async () => {
  await openRecord();
  expect(tree!.root.findAllByType("option").filter(option => option.children.includes("Card only"))).toHaveLength(0);
});

test("editing an existing card-only purchase retains Card only", async () => {
  dataset.records[0].accountId = undefined;
  dataset.records[0].accountAmount = undefined;
  await openRecord();
  expect(tree!.root.findAllByType("option").filter(option => option.children.includes("Card only"))).toHaveLength(1);
});
