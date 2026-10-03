import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { WalletProvider, useWallet } from "./wallet-provider";
import * as api from "../services/wallet-api";

const auth = vi.hoisted(() => ({ token: "test-session", lock: vi.fn() }));
const theme = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/providers/theme-provider", () => ({ useTheme: () => theme }));
vi.mock("@/services/wallet-api");
let context: ReturnType<typeof useWallet>;
let tree: ReactTestRenderer | undefined;
function Consumer() {
  const value = useWallet();
  useEffect(() => { context = value; }, [value]);
  return <p>{value.dataset.records.length} records</p>;
}
const bootstrap = {
  dataset: mockWalletData,
  recordsPage: { hasMore: true, nextCursor: "page2" },
  generatedDebts: [],
  serverDate: "2026-10-03",
};

test("investment valuation sends a partial patch and reloads canonical cost and start date", async () => {
  await act(async () => { tree = create(<WalletProvider><Consumer /></WalletProvider>); });
  const investment = context.dataset.investments[0];
  const reloaded = structuredClone(mockWalletData);
  reloaded.investments.find((item) => item.id === investment.id)!.currentValue = 0;
  vi.mocked(api.updateInvestment).mockResolvedValue({ ...investment, currentValue: 0 });
  vi.mocked(api.getWallet).mockResolvedValue(reloaded);
  await act(async () => { await context.updateInvestment(investment.id, { currentValue: 0 }); });
  expect(api.updateInvestment).toHaveBeenCalledExactlyOnceWith("test-session", investment.id, { currentValue: 0 });
  expect(context.dataset.investments.find((item) => item.id === investment.id)).toMatchObject({ currentValue: 0, amountInvested: investment.amountInvested, startedAt: investment.startedAt, currency: investment.currency });
});
beforeEach(() => {
  vi.clearAllMocks();
  auth.token = "test-session";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api.bootstrapWallet).mockResolvedValue(bootstrap);
  vi.mocked(api.getWallet).mockResolvedValue(structuredClone(mockWalletData));
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

test("account archive refresh retains durable records returned by server", async () => {
  await act(async () => {
    tree = create(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  const before = context.dataset.records.length;
  vi.mocked(api.deleteAccount).mockResolvedValue({ deleted: true });
  const canonical = structuredClone(mockWalletData);
  canonical.accounts[0].isActive = false;
  vi.mocked(api.getWallet).mockResolvedValue(canonical);
  await act(async () => {
    await context.deleteAccount(canonical.accounts[0].id);
  });
  expect(context.dataset.records).toHaveLength(before);
  expect(context.dataset.accounts[0].isActive).toBe(false);
  expect(theme.setTheme).toHaveBeenCalledWith(canonical.settings.theme);
});

test("successful write plus failed reload rejects and preserves visible error feedback", async () => {
  await act(async () => {
    tree = create(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  vi.mocked(api.deleteRecord).mockResolvedValue({ deleted: true });
  vi.mocked(api.getWallet).mockRejectedValue(new Error("offline"));
  await act(async () => {
    await expect(context.deleteRecord("record")).rejects.toThrow(
      /saved.*refresh/i,
    );
  });
  expect(context.isAllHistoryComplete).toBe(false);
  expect(JSON.stringify(tree?.toJSON())).toContain("offline");
  vi.mocked(api.getWallet).mockResolvedValue({
    ...mockWalletData,
    records: [],
  });
  await act(async () => {
    await context.loadMoreRecords();
  });
  expect(context.isAllHistoryComplete).toBe(true);
  expect(context.dataset.records).toEqual([]);
});

test("background boot snapshot cannot undo an edit made while cached data is visible", async () => {
  auth.token = `${btoa(JSON.stringify({ sub: "test-owner" }))}.signature`;
  const storage = {
    getItem: () =>
      JSON.stringify({
        schemaVersion: 2,
        cachedAt: new Date().toISOString(),
        environment: "http://test.local",
        ownerKey: "test-owner",
        dataset: mockWalletData,
        recordsPage: { hasMore: false, nextCursor: null },
      }),
    setItem: vi.fn(),
  };
  vi.stubGlobal("window", {
    location: { origin: "http://test.local" },
    localStorage: storage,
  });
  let resolve!: (value: typeof bootstrap) => void;
  vi.mocked(api.bootstrapWallet).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await act(async () => {
    tree = create(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  vi.mocked(api.deleteRecord).mockResolvedValue({ deleted: true });
  vi.mocked(api.getWallet).mockResolvedValue({
    ...mockWalletData,
    records: [],
  });
  await act(async () => {
    await context.deleteRecord("record");
  });
  vi.mocked(api.getWallet).mockResolvedValue(mockWalletData);
  await act(async () => {
    resolve(bootstrap);
  });
  expect(context.dataset.records).toEqual([]);
});

test("cached bootstrap failure remains visible and storage quota does not break a later refresh", async () => {
  auth.token = `${btoa(JSON.stringify({ sub: "test-owner" }))}.signature`;
  vi.stubGlobal("window", {
    location: { origin: "http://test.local" },
    localStorage: {
      getItem: () =>
        JSON.stringify({
          schemaVersion: 2,
          cachedAt: new Date().toISOString(),
          environment: "http://test.local",
          ownerKey: "test-owner",
          dataset: mockWalletData,
          recordsPage: { hasMore: false, nextCursor: null },
        }),
      setItem() {
        throw new Error("quota");
      },
    },
  });
  vi.mocked(api.bootstrapWallet).mockRejectedValue(
    new Error("offline cached refresh"),
  );
  await act(async () => {
    tree = create(
      <WalletProvider>
        <Consumer />
      </WalletProvider>,
    );
  });
  expect(JSON.stringify(tree?.toJSON())).toContain("offline cached refresh");
  expect(context.dataset.records.length).toBeGreaterThan(0);
  await act(async () => {
    await context.getCompleteDataset();
  });
  expect(context.isAllHistoryComplete).toBe(true);
});

test("a complete backup can include archived history without publishing it into the active wallet",async()=>{
  await act(async()=>{tree=create(<WalletProvider><Consumer /></WalletProvider>);});
  const activeCount=context.dataset.records.length;
  const backup=structuredClone(mockWalletData);
  backup.records.push({...backup.records[0],id:"archived-history"});
  vi.mocked(api.getWalletBackup).mockResolvedValue(backup);
  let exported:typeof backup|undefined;
  await act(async()=>{exported=await context.getBackupDataset();});
  expect(exported!.records.length).toBe(activeCount+1);
  expect(context.dataset.records.length).toBe(activeCount);
});

test("a pending write cannot recreate private cached data after the wallet is closed",async()=>{
  auth.token=`${btoa(JSON.stringify({sub:"test-owner"}))}.signature`;
  const storage=new Map<string,string>();
  vi.stubGlobal("window",{location:{origin:"http://test.local"},localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}});
  await act(async()=>{tree=create(<WalletProvider><Consumer/></WalletProvider>);});
  let release!:()=>void;
  vi.mocked(api.deleteRecord).mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({deleted:true});}));
  let pending!:Promise<void>;
  await act(async()=>{pending=context.deleteRecord("record");});
  await act(async()=>{tree!.unmount();});tree=undefined;
  storage.delete("wallet-dataset-cache");
  await act(async()=>{release();await pending;});
  expect(storage.has("wallet-dataset-cache")).toBe(false);
});
