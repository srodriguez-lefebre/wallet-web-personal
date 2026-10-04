import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { ImportsView } from "./imports-view";
const state = vi.hoisted(() => ({
  dataset: undefined as unknown as typeof mockWalletData,
  backup: vi.fn(),
  complete: vi.fn(),
  importRecords: vi.fn(),
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset: state.dataset,
    getBackupDataset: state.backup,
    getCompleteDataset: state.complete,
    importRecords: state.importRecords,
    selectedDateRange: { from: "2026-06-01", to: "2026-06-30" },
    selectedPeriodMode: "month",
    isAllHistoryComplete: true,
    clearRecordFilters: vi.fn(),
    setRecordFilters: vi.fn(),
    setAllPeriod: vi.fn(),
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (work: () => Promise<unknown>) => work(),
  }),
}));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  const data = structuredClone(mockWalletData);
  data.accounts = [
    { ...data.accounts[0], id: "00000000-0000-4000-8000-000000000001" },
  ];
  data.categories = [
    { ...data.categories[0], id: "00000000-0000-4000-8000-000000000002" },
  ];
  data.records = [
    {
      ...data.records[0],
      id: "00000000-0000-4000-8000-000000000003",
      accountId: data.accounts[0].id,
      categoryId: data.categories[0].id,
      goalIds: [],
      goalAssociations: [],
      tagIds: [],
      creditCardId: undefined,
    },
  ];
  data.creditCards = [];
  data.creditCardRecords = [];
  state.dataset = data;
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("JSON export downloads complete archived history and remembers only date and counts", async () => {
  vi.useFakeTimers();
  const stored = new Map<string, string>(),
    anchor = { href: "", download: "", click: vi.fn() };
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    }),
  );
  vi.stubGlobal("document", { createElement: () => anchor });
  const createUrl = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:local");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const backup = structuredClone(state.dataset);
  backup.records.push(
    Object.assign(
      { ...backup.records[0], id: "archived-history" },
      { deletedAt: "2026-01-01T12:00:00Z" },
    ),
  );
  state.backup.mockResolvedValue(backup);
  await act(async () => {
    tree = create(<ImportsView />);
  });
  await act(async () =>
    tree!.root
      .findAllByType("button")
      .find((button) => button.children.includes("JSON backup"))!
      .props.onClick(),
  );
  expect(state.backup).toHaveBeenCalledTimes(1);
  expect(state.complete).not.toHaveBeenCalled();
  expect(anchor.click).toHaveBeenCalledTimes(1);
  expect(anchor.download).toMatch(/^wallet-backup-.*Z\.json$/);
  const downloaded = JSON.parse(
    await (createUrl.mock.calls[0][0] as Blob).text(),
  );
  expect(downloaded.records).toHaveLength(backup.records.length);
  const receipt = JSON.parse(stored.get("wallet-last-backup-export")!);
  expect(Object.keys(receipt).sort()).toEqual([
    "cardRecords",
    "records",
    "requestedAt",
  ]);
  expect(receipt.records).toBe(backup.records.length);
});
test("two import clicks do not submit two financial batches", async () => {
  let release!: (value: typeof mockWalletData) => void;
  state.complete.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  state.importRecords.mockResolvedValue(1);
  await act(async () => {
    tree = create(<ImportsView />);
  });
  await act(async () => {
    const form = tree!.root.findByType("form");
    form.props.onSubmit({ preventDefault() {} });
    form.props.onSubmit({ preventDefault() {} });
  });
  expect(state.complete).toHaveBeenCalledTimes(1);
  await act(async () => release(state.dataset));
  expect(state.importRecords).toHaveBeenCalledTimes(1);
});
