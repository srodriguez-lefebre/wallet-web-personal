// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "@shared/mock-data";

import { CardsView } from "./cards-view";

import { createActionToastRunner } from "@/lib/action-toast-runner";
import { withWalletMetadata } from "@/test/legacy-wallet-view";

const actions = vi.hoisted(() => ({
  addCreditCard: vi.fn(),
  updateCreditCard: vi.fn(),
  deleteCreditCard: vi.fn().mockResolvedValue(undefined),
  refreshCardStatements: vi.fn().mockResolvedValue(undefined),
}));
let dataset = structuredClone(mockWalletData);
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () =>
    withWalletMetadata({
      dataset,
      ...actions,
      isAllHistoryComplete: true,
      selectedMonth: "2026-11",
      selectedPeriodMode: "month",
      selectedDateRange: { from: "2026-11-01", to: "2026-11-30" },
    }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({ toast: null, runAction: createActionToastRunner(() => {}) }),
}));
vi.mock("recharts", () =>
  Object.fromEntries(
    [
      "CartesianGrid",
      "Cell",
      "Legend",
      "Line",
      "LineChart",
      "Pie",
      "PieChart",
      "ResponsiveContainer",
      "Tooltip",
      "XAxis",
      "YAxis",
    ].map((name) => [name, () => null]),
  ),
);
beforeEach(() => {
  vi.clearAllMocks();
  actions.addCreditCard.mockResolvedValue("synthetic-new-card");
  actions.updateCreditCard.mockResolvedValue(undefined);
  dataset = structuredClone(mockWalletData);
  dataset.records = [];
  dataset.creditCardRecords = [];
  dataset.creditCardStatements = [];
  dataset.creditCardPayments = [];
  dataset.creditCardPaymentAllocations = [];
  dataset.creditCards = [
    {
      id: "synthetic-card",
      name: "Synthetic old card",
      issuer: "Synthetic bank",
      lastFour: "9876",
      creditLimit: 1000,
      limitCurrency: "UYU",
      closingDay: 20,
      dueDay: 5,
      color: "#2563EB",
      icon: "credit-card",
      isActive: true,
    },
  ];
});
afterEach(cleanup);
function mount() {
  render(
    <MemoryRouter>
      <CardsView />
    </MemoryRouter>,
  );
}
function fillNewCard() {
  fireEvent.click(screen.getByRole("button", { name: "New card" }));
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Name"), {
    target: { value: "  Synthetic new card  " },
  });
  fireEvent.change(screen.getByLabelText("Issuer"), { target: { value: "  Synthetic issuer  " } });
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Last four digits"), {
    target: { value: "12a345" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Limit" }), {
    target: { value: "2500.5" },
  });
}

test("card action buttons have no interactive ancestor and keep native keyboard activation", async () => {
  mount();
  const edit = screen.getByRole("button", { name: "Edit" });
  const archive = screen.getByRole("button", { name: "Archive" });
  for (const button of [edit, archive]) {
    expect(button.closest('[role="link"],a')).toBeNull();
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
  }
  fireEvent.click(edit);
  expect(screen.getByRole("dialog")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(archive);
  await waitFor(() =>
    expect(actions.deleteCreditCard).toHaveBeenCalledExactlyOnceWith("synthetic-card"),
  );
});
test("new card submits the trimmed identity, masked digits and billing defaults", async () => {
  mount();
  fillNewCard();
  expect(screen.getByLabelText<HTMLInputElement>("Last four digits").value).toBe("1234");
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(actions.addCreditCard).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      name: "Synthetic new card",
      issuer: "Synthetic issuer",
      lastFour: "1234",
      creditLimit: 2500.5,
      limitCurrency: "UYU",
      closingDay: 20,
      dueDay: 5,
      icon: "credit-card",
      isActive: true,
    }),
  );
});
test("editing a card changes the selected card and retains untouched billing fields", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Synthetic old card");
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Name"), {
    target: { value: "Synthetic renamed card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(actions.updateCreditCard).toHaveBeenCalledExactlyOnceWith(
    "synthetic-card",
    expect.objectContaining({
      name: "Synthetic renamed card",
      lastFour: "9876",
      creditLimit: 1000,
      closingDay: 20,
      dueDay: 5,
    }),
  );
  expect(actions.addCreditCard).not.toHaveBeenCalled();
});
test("a failed save retains the draft and can be retried after feedback", async () => {
  actions.addCreditCard.mockRejectedValueOnce(new Error("Synthetic offline failure"));
  mount();
  fillNewCard();
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await screen.findByText("Synthetic offline failure");
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("  Synthetic new card  ");
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(actions.addCreditCard).toHaveBeenCalledTimes(2);
});
test("a pending card save prevents a second submit", async () => {
  let release!: (id: string) => void;
  actions.addCreditCard.mockReturnValue(
    new Promise<string>((resolve) => {
      release = resolve;
    }),
  );
  mount();
  fillNewCard();
  const save = screen.getByRole("button", { name: "Save card" });
  fireEvent.click(save);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Saving..." }).disabled).toBe(true);
  fireEvent.submit(save.closest("form")!);
  await waitFor(() => expect(actions.addCreditCard).toHaveBeenCalledTimes(1));
  release("synthetic-new-card");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
