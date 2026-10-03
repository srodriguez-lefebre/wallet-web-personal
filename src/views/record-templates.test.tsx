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
}));
let dataset: WalletDataset,
  tree: ReactTestRenderer | undefined,
  newRecordRequestId = 0;
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
    consumeNewRecordRequest: vi.fn(),
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.clearAllMocks();
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
async function openSaved(edit = false) {
  dataset.recordTemplates = [template()];
  await mount();
  await act(async () => button("Open templates (1)").props.onClick());
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": `${edit ? "Edit" : "Use"} template Coffee` })
      .props.onClick(),
  );
}
async function editSource() {
  await mount();
  await act(async () =>
    tree!.root
      .findAllByProps({ role: "button", tabIndex: 0 })[0]
      .props.onClick(),
  );
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Template name" })
      .props.onChange({ target: { value: "Coffee" } }),
  );
}
test("save as template persists reusable details and never creates a financial record", async () => {
  await editSource();
  await act(async () => button("Save as template").props.onClick());
  expect(actions.addTemplate).toHaveBeenCalledTimes(1);
  const value = actions.addTemplate.mock.calls[0][0];
  expect(value).toMatchObject({ name: "Coffee", amount: 10, currency: "USD" });
  for (const key of [
    "id",
    "occurredAt",
    "accountAmount",
    "exchangeRateToPrimary",
    "debtId",
    "goalAssociations",
    "goalIds",
  ])
    expect(value).not.toHaveProperty(key);
  expect(actions.addRecord).not.toHaveBeenCalled();
  expect(actions.updateRecord).not.toHaveBeenCalled();
  expect(JSON.stringify(tree!.toJSON())).toContain("No movement was created");
});
test("double click saves only one template while the request is pending", async () => {
  let release!: (id: string) => void;
  actions.addTemplate.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await editSource();
  await act(async () => {
    button("Save as template").props.onClick();
    button("Save as template").props.onClick();
  });
  expect(actions.addTemplate).toHaveBeenCalledTimes(1);
  await act(async () => release("saved"));
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
test("template editing updates its details without inserting or editing movements", async () => {
  await openSaved(true);
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Template name" })
      .props.onChange({ target: { value: "Weekly coffee" } }),
  );
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(actions.updateTemplate).toHaveBeenCalledExactlyOnceWith(
    "saved",
    expect.objectContaining({
      name: "Weekly coffee",
      note: null,
      creditCardId: null,
    }),
  );
  expect(actions.addRecord).not.toHaveBeenCalled();
  expect(actions.updateRecord).not.toHaveBeenCalled();
});
test("an archived financial destination leaves an invalid draft that cannot be confirmed", async () => {
  dataset.recordTemplates = [template()];
  dataset.accounts[0].isActive = false;
  await mount();
  await act(async () => button("Open templates (1)").props.onClick());
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Use template Coffee" })
      .props.onClick(),
  );
  expect(button("Add").props.disabled).toBe(true);
  expect(JSON.stringify(tree!.toJSON())).toContain("Choose an active account");
  expect(actions.addRecord).not.toHaveBeenCalled();
});
test("retry reconciles a template saved before a failed canonical read instead of duplicating it", async () => {
  actions.addTemplate.mockRejectedValueOnce(
    new Error("Saved but refresh failed"),
  );
  await editSource();
  await act(async () => button("Save as template").props.onClick());
  expect(tree!.root.findByProps({ role: "alert" })).toBeDefined();
  actions.read.mockResolvedValue({
    ...dataset,
    recordTemplates: [{ ...actions.addTemplate.mock.calls[0][0], id: "saved" }],
  });
  await act(async () => button("Save as template").props.onClick());
  expect(actions.addTemplate).toHaveBeenCalledTimes(1);
  expect(actions.read).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree!.toJSON())).toContain("No movement was created");
});
test("library removal is single flight and does not delete financial history", async () => {
  dataset.recordTemplates = [template()];
  let release!: () => void;
  actions.removeTemplate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await mount();
  await act(async () => button("Open templates (1)").props.onClick());
  await act(async () => {
    tree!.root
      .findByProps({ "aria-label": "Remove template Coffee" })
      .props.onClick();
    tree!.root
      .findByProps({ "aria-label": "Remove template Coffee" })
      .props.onClick();
  });
  expect(actions.removeTemplate).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(dataset.records).toHaveLength(1);
  expect(actions.updateRecord).not.toHaveBeenCalled();
});

test("a global new-record request leaves template edit mode and clears its metadata", async () => {
  await openSaved(true);
  newRecordRequestId = 1;
  await act(async () => {
    tree!.update(<RecordsView />);
  });
  expect(
    tree!.root.findByProps({ "aria-label": "Template name" }).props.value,
  ).toBe("");
  expect(button("Add")).toBeDefined();
  expect(
    tree!.root
      .findAllByType("button")
      .some((b) => b.children.includes("Save template changes")),
  ).toBe(false);
  expect(actions.updateTemplate).not.toHaveBeenCalled();
  expect(actions.addRecord).not.toHaveBeenCalled();
});

test("template editing only exposes reusable fields", async () => {
  await openSaved(true);
  expect(
    tree!.root
      .findAllByType("input")
      .some((input) => input.props.type === "datetime-local"),
  ).toBe(false);
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Cotización a UYU");
  expect(JSON.stringify(tree!.toJSON())).not.toContain('"Status"');
  expect(button("Save template changes")).toBeDefined();
});

test("an uncertain financial save blocks a second create until records are reviewed", async () => {
  actions.addRecord.mockRejectedValueOnce(
    new Error("Saved but refresh failed"),
  );
  await openSaved();
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(button("Add").props.disabled).toBe(true);
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(actions.addRecord).toHaveBeenCalledTimes(1);
  await act(async () => button("Reload and review records").props.onClick());
  expect(actions.read).toHaveBeenCalledTimes(1);
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
  expect(actions.addRecord).toHaveBeenCalledTimes(1);
});

test("failed reconciliation keeps an uncertain create blocked", async () => {
  actions.addRecord.mockRejectedValueOnce(new Error("Response lost"));
  actions.read.mockRejectedValue(new Error("Offline"));
  await openSaved();
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  await act(async () => button("Reload and review records").props.onClick());
  expect(button("Add").props.disabled).toBe(true);
  expect(actions.addRecord).toHaveBeenCalledTimes(1);
});

test("a global new-record request clears the previous draft's uncertain outcome", async () => {
  actions.addRecord.mockRejectedValueOnce(new Error("Response lost"));
  await openSaved();
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(button("Add").props.disabled).toBe(true);
  newRecordRequestId = 1;
  await act(async () => tree!.update(<RecordsView />));
  expect(JSON.stringify(tree!.toJSON())).not.toContain(
    "save outcome is uncertain",
  );
  expect(
    tree!.root.findByProps({ "aria-label": "Template name" }).props.value,
  ).toBe("");
});

test("a late template save cannot close a different draft opened after cancellation", async () => {
  let release!: () => void;
  actions.updateTemplate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await openSaved(true);
  await act(async () => {
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  await act(async () => button("Cancel").props.onClick());
  dataset.recordTemplates = [{ ...template(), id: "second", name: "Tea" }];
  await act(async () => {
    tree!.update(<RecordsView />);
  });
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Use template Tea" })
      .props.onClick(),
  );
  await act(async () => release());
  expect(tree!.root.findByType("form")).toBeDefined();
  expect(
    tree!.root.findByProps({ "aria-label": "Template name" }).props.value,
  ).toBe("Tea");
  expect(button("Add")).toBeDefined();
  expect(actions.addRecord).not.toHaveBeenCalled();
});

test("a late failed template save cannot inject its error or retry state into another draft", async () => {
  let reject!: (error: Error) => void;
  actions.updateTemplate.mockImplementation(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  await openSaved(true);
  await act(async () => {
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  await act(async () => button("Cancel").props.onClick());
  dataset.recordTemplates = [{ ...template(), id: "second", name: "Tea" }];
  await act(async () => {
    tree!.update(<RecordsView />);
  });
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Use template Tea" })
      .props.onClick(),
  );
  await act(async () => reject(new Error("old save failed")));
  expect(tree!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  expect(
    tree!.root.findByProps({ "aria-label": "Template name" }).props.value,
  ).toBe("Tea");
});
