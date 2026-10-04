import type { PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { RecordTemplate, WalletDataset } from "../../shared/types";
import { RecordsView } from "./records-view";
const actions = vi.hoisted(() => ({
  addTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  removeTemplate: vi.fn(),
  read: vi.fn(),
  addRecord: vi.fn(),
  updateRecord: vi.fn(),
  consume: vi.fn(),
}));
let dataset: WalletDataset,
  tree: ReactTestRenderer | undefined,
  newRecordRequestId = 0,
  newRecordTemplateId: string | null = null;
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset,
    selectedMonth: "2026-10",
    selectedPeriodMode: "month",
    selectedDateRange: { from: "2026-10-01", to: "2026-10-31" },
    recordFilters: {},
    setRecordFilters: vi.fn(),
    clearRecordFilters: vi.fn(),
    setAllPeriod: vi.fn(),
    addRecord: actions.addRecord,
    updateRecord: actions.updateRecord,
    deleteRecord: vi.fn(),
    newRecordRequestId,
    newRecordTemplateId,
    consumeNewRecordRequest: actions.consume,
    recordsPage: { hasMore: false },
    isLoadingMoreRecords: false,
    isSelectedRangeComplete: true,
    isAllHistoryComplete: true,
    loadMoreRecords: vi.fn(),
    getCompleteDataset: actions.read,
    addRecordTemplate: actions.addTemplate,
    updateRecordTemplate: actions.updateTemplate,
    deleteRecordTemplate: actions.removeTemplate,
  }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (work: () => Promise<unknown>) => work(),
  }),
}));
vi.mock("@/components/wallet/category-picker", () => ({
  CategoryPicker: () => null,
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
beforeEach(() => {
  newRecordRequestId = 0;
  newRecordTemplateId = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.clearAllMocks();
  actions.consume.mockImplementation(() => {
    newRecordRequestId = 0;
    newRecordTemplateId = null;
  });
  dataset = structuredClone(mockWalletData);
  dataset.goals = [];
  dataset.accounts[0].currency = "UYU";
  dataset.settings.primaryCurrency = "UYU";
  dataset.records = [
    {
      ...dataset.records[0],
      occurredAt: "2026-10-01T12:00:00Z",
      type: "expense",
      amount: 10,
      currency: "USD",
      accountId: dataset.accounts[0].id,
      accountAmount: 410,
      exchangeRateToPrimary: 41,
      categoryId: dataset.categories[0].id,
      tagIds: [],
      goalIds: [],
      goalAssociations: [],
      paymentType: "debit",
      debtId: undefined,
      creditCardId: undefined,
    },
  ];
  dataset.exchangeRates = [
    {
      id: "rate",
      fromCurrency: "USD",
      toCurrency: "UYU",
      rate: 44,
      date: "2026-10-01T12:00:00Z",
    },
  ];
  dataset.recordTemplates = [];
  actions.addTemplate.mockResolvedValue("new-template");
  actions.updateTemplate.mockResolvedValue(undefined);
  actions.removeTemplate.mockResolvedValue(undefined);
  actions.addRecord.mockResolvedValue(undefined);
  actions.read.mockImplementation(async () => dataset);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function template(): RecordTemplate {
  return {
    id: "saved",
    name: "Coffee",
    type: "expense",
    amount: 10,
    currency: "USD",
    accountId: dataset.accounts[0].id,
    categoryId: dataset.categories[0].id,
    paymentType: "debit",
  };
}
async function mount() {
  await act(async () => {
    tree = create(<RecordsView />);
  });
}
function button(text: string) {
  return tree!.root
    .findAllByType("button")
    .find((b) => b.children.includes(text))!;
}
async function openSaved() {
  dataset.recordTemplates = [template()];
  newRecordRequestId = 1;
  newRecordTemplateId = "saved";
  await mount();
}
test("new movements do not expose template management", async () => {
  await mount();
  await act(async () => button("New").props.onClick());
  expect(
    tree!.root.findAllByProps({ "aria-label": "Template name" }),
  ).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Save as template");
});
test("editing a movement does not expose template management", async () => {
  await mount();
  await act(async () =>
    tree!.root
      .findAllByProps({ role: "button", tabIndex: 0 })[0]
      .props.onClick(),
  );
  expect(
    tree!.root.findAllByProps({ "aria-label": "Template name" }),
  ).toHaveLength(0);
});
test("records no longer contain the template library", async () => {
  await mount();
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Record templates");
});
test("using a template writes nothing until confirmation then freezes the new date and current conversion", async () => {
  await openSaved();
  expect(actions.addRecord).not.toHaveBeenCalled();
  expect(tree!.root.findByType("form")).toBeDefined();
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  const value = actions.addRecord.mock.calls[0][0];
  expect(value.accountAmount).toBe(440);
  expect(value.exchangeRateToPrimary).toBe(44);
  expect(value.occurredAt).toBe("2026-10-03T12:00:00.000Z");
  expect(value.debtId).toBeUndefined();
  expect(actions.updateTemplate).not.toHaveBeenCalled();
});
test("an archived financial destination leaves an invalid draft that cannot be confirmed", async () => {
  dataset.recordTemplates = [template()];
  dataset.accounts[0].isActive = false;
  newRecordRequestId = 1;
  newRecordTemplateId = "saved";
  await mount();
  expect(button("Add").props.disabled).toBe(true);
  expect(JSON.stringify(tree!.toJSON())).toContain("Choose an active account");
  expect(actions.addRecord).not.toHaveBeenCalled();
});
test("a failed record save retains an editable draft and allows a normal retry", async () => {
  actions.addRecord.mockRejectedValueOnce(
    new Error("Saved but refresh failed"),
  );
  await openSaved();
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(button("Add").props.disabled).toBe(false);
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(actions.addRecord).toHaveBeenCalledTimes(2);
  expect(actions.read).not.toHaveBeenCalled();
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
});

test("pending record submissions remain single flight", async () => {
  let release!: () => void;
  actions.addRecord.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await openSaved();
  await act(async () => {
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  expect(actions.addRecord).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
});

test("a global new-record request starts fresh after a failed save", async () => {
  actions.addRecord.mockRejectedValueOnce(new Error("Response lost"));
  await openSaved();
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(button("Add").props.disabled).toBe(false);
  newRecordRequestId = 2;
  newRecordTemplateId = null;
  await act(async () => tree!.update(<RecordsView />));
  expect(JSON.stringify(tree!.toJSON())).not.toContain(
    "save outcome is uncertain",
  );
  expect(
    tree!.root.findAllByProps({ "aria-label": "Template name" }),
  ).toHaveLength(0);
});

test("needs-review records display an amber status label", async () => {
  dataset.records[0].paymentStatus = "needs_review";
  await mount();
  const labels = tree!.root
    .findAllByType("span")
    .filter((span) => span.children.includes("Needs review"));
  expect(
    labels.some((label) => label.props.className.includes("bg-amber")),
  ).toBe(true);
});
