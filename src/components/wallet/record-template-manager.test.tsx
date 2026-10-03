import type { PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { mockWalletData } from "../../../shared/mock-data";
import type { RecordTemplate, WalletDataset } from "../../../shared/types";
import { RecordTemplateManager } from "./record-template-manager";
const actions = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  read: vi.fn(),
  request: vi.fn(),
  navigate: vi.fn(),
  addRecord: vi.fn(),
}));
let dataset: WalletDataset, tree: ReactTestRenderer | undefined;
const accountId = "00000000-0000-4000-8000-000000000001",
  categoryId = "00000000-0000-4000-8000-000000000002",
  templateId = "00000000-0000-4000-8000-000000000003";
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset,
    addRecordTemplate: actions.add,
    updateRecordTemplate: actions.update,
    deleteRecordTemplate: actions.remove,
    getCompleteDataset: actions.read,
    requestNewRecord: actions.request,
    addRecord: actions.addRecord,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => actions.navigate }));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (work: () => Promise<unknown>) => work(),
  }),
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
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  dataset = structuredClone(mockWalletData);
  dataset.accounts = [
    {
      ...dataset.accounts[0],
      id: accountId,
      currency: "UYU",
      isActive: true,
      isVisible: true,
    },
  ];
  dataset.categories = [{ ...dataset.categories[0], id: categoryId }];
  dataset.settings.primaryAccountId = accountId;
  dataset.settings.defaultAccountId = accountId;
  dataset.settings.primaryCurrency = "UYU";
  dataset.recordTemplates = [];
  actions.add.mockResolvedValue(templateId);
  actions.update.mockResolvedValue(undefined);
  actions.remove.mockResolvedValue(undefined);
  actions.read.mockImplementation(async () => dataset);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
function saved(): RecordTemplate {
  return {
    id: templateId,
    name: "Alquiler",
    type: "expense",
    amount: 100,
    currency: "UYU",
    accountId,
    categoryId,
    paymentType: "debit",
  };
}
async function mount() {
  await act(async () => {
    tree = create(<RecordTemplateManager />);
  });
}
function button(text: string) {
  return tree!.root
    .findAllByType("button")
    .find((button) => button.children.includes(text))!;
}
async function fill(label: string, value: string) {
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": label })
      .props.onChange({ target: { value } }),
  );
}
async function createDraft() {
  await mount();
  await act(async () => button("Crear plantilla").props.onClick());
  await fill("Nombre de plantilla", "Alquiler");
  await fill("Importe de plantilla", "100");
}
async function submit() {
  await act(async () =>
    tree!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
}
test("settings manager creates reusable configuration without inserting financial history", async () => {
  const before = structuredClone(dataset.records);
  await createDraft();
  await submit();
  expect(actions.add).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      name: "Alquiler",
      amount: 100,
      currency: "UYU",
      accountId,
    }),
  );
  const payload = actions.add.mock.calls[0][0];
  for (const key of [
    "occurredAt",
    "accountAmount",
    "exchangeRateToPrimary",
    "goalIds",
    "debtId",
  ])
    expect(payload).not.toHaveProperty(key);
  expect(dataset.records).toEqual(before);
  expect(actions.addRecord).not.toHaveBeenCalled();
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
});
test("use requests a fresh record draft and routes to records without writing", async () => {
  dataset.recordTemplates = [saved()];
  await mount();
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Usar plantilla Alquiler" })
      .props.onClick(),
  );
  expect(actions.request).toHaveBeenCalledExactlyOnceWith(templateId);
  expect(actions.navigate).toHaveBeenCalledExactlyOnceWith("/records");
  expect(actions.addRecord).not.toHaveBeenCalled();
  expect(actions.add).not.toHaveBeenCalled();
});
test("editing a template clears optional fields through the shared patch contract", async () => {
  dataset.recordTemplates = [{ ...saved(), note: "Anterior" }];
  await mount();
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Editar plantilla Alquiler" })
      .props.onClick(),
  );
  await fill("Nombre de plantilla", "Alquiler actualizado");
  await fill("Nota de plantilla", "");
  await submit();
  expect(actions.update).toHaveBeenCalledExactlyOnceWith(
    templateId,
    expect.objectContaining({
      name: "Alquiler actualizado",
      note: null,
      creditCardId: null,
    }),
  );
  expect(actions.addRecord).not.toHaveBeenCalled();
  expect(
    tree!.root
      .findAllByType("input")
      .some((input) => input.props.type === "datetime-local"),
  ).toBe(false);
});
test("pending saves are single flight", async () => {
  let release!: (id: string) => void;
  actions.add.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  await createDraft();
  await act(async () => {
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  expect(actions.add).toHaveBeenCalledTimes(1);
  await act(async () => release(templateId));
});
test("retry reconciles a committed create whose refresh failed", async () => {
  actions.add.mockRejectedValueOnce(new Error("Saved but reload failed"));
  await createDraft();
  await submit();
  expect(tree!.root.findByProps({ role: "alert" })).toBeDefined();
  actions.read.mockResolvedValue({
    ...dataset,
    recordTemplates: [{ ...actions.add.mock.calls[0][0], id: templateId }],
  });
  await submit();
  expect(actions.read).toHaveBeenCalledTimes(1);
  expect(actions.add).toHaveBeenCalledTimes(1);
  expect(tree!.root.findAllByType("form")).toHaveLength(0);
});
test("invalid amounts cannot persist a template", async () => {
  await createDraft();
  await fill("Importe de plantilla", "0");
  await submit();
  expect(actions.add).not.toHaveBeenCalled();
  expect(tree!.root.findByProps({ role: "alert" })).toBeDefined();
});
test("delete retry reconciles an already-removed template without touching records", async () => {
  dataset.recordTemplates = [saved()];
  actions.remove.mockRejectedValueOnce(new Error("Response lost"));
  await mount();
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Quitar plantilla Alquiler" })
      .props.onClick(),
  );
  actions.read.mockResolvedValue({ ...dataset, recordTemplates: [] });
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Quitar plantilla Alquiler" })
      .props.onClick(),
  );
  expect(actions.remove).toHaveBeenCalledTimes(1);
  expect(actions.read).toHaveBeenCalledTimes(1);
  expect(actions.addRecord).not.toHaveBeenCalled();
});
test("late save completion does not close another configuration draft", async () => {
  let release!: (id: string) => void;
  actions.add.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  await createDraft();
  await act(async () => {
    void tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  await act(async () => button("Cancelar").props.onClick());
  await act(async () => button("Crear plantilla").props.onClick());
  await fill("Nombre de plantilla", "Otra plantilla");
  await act(async () => release(templateId));
  expect(
    tree!.root.findByProps({ "aria-label": "Nombre de plantilla" }).props.value,
  ).toBe("Otra plantilla");
  expect(tree!.root.findByType("form")).toBeDefined();
});
