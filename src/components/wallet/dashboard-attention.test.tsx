import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../../shared/mock-data";
import { walletAttention } from "@/lib/wallet-attention";
import { WalletAttentionPanel } from "./wallet-attention-panel";
import { WalletRefreshButton } from "./wallet-refresh-button";
import { DebtNetBadge } from "./debt-net-badge";
import { calculateVisibleDebtSummary } from "@shared/calculations";
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (work: () => Promise<unknown>) => work(),
  }),
}));
let tree: ReactTestRenderer | undefined;
test("debt net distinguishes unknown amounts and partial known totals", async () => {
  const data = structuredClone(mockWalletData);
  data.debts = [
    {
      ...data.debts[0],
      status: "active",
      isVisible: true,
      pendingAmount: undefined,
    },
  ];
  await act(async () => {
    tree = create(
      <DebtNetBadge
        summary={calculateVisibleDebtSummary(data)}
        currency="UYU"
      />,
    );
  });
  expect(JSON.stringify(tree!.toJSON())).toContain("Net unavailable");
  expect(JSON.stringify(tree!.toJSON())).not.toContain("$ 0");
  data.debts.push({
    ...data.debts[0],
    id: "known",
    pendingAmount: 10,
    currency: "UYU",
  });
  await act(async () => {
    tree!.update(
      <DebtNetBadge
        summary={calculateVisibleDebtSummary(data)}
        currency="UYU"
      />,
    );
  });
  expect(JSON.stringify(tree!.toJSON())).toContain("Known net");
});
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
test("attention includes old review drafts and overdue visible open debts, excluding settled and undated debts", () => {
  const data = structuredClone(mockWalletData);
  data.records = [
    {
      ...data.records[0],
      occurredAt: "2020-01-01T12:00:00Z",
      paymentStatus: "needs_review",
    },
  ];
  const debt = {
    ...data.debts[0],
    status: "active" as const,
    isVisible: true,
    pendingAmount: undefined,
  };
  data.debts = [
    { ...debt, id: "old", dueAt: "2026-09-01" },
    { ...debt, id: "today", dueAt: "2026-10-03" },
    { ...debt, id: "seven", dueAt: "2026-10-10" },
    { ...debt, id: "eight", dueAt: "2026-10-11" },
    { ...debt, id: "none", dueAt: undefined },
    { ...debt, id: "settled", dueAt: "2026-09-01", status: "paid" },
    { ...debt, id: "hidden", dueAt: "2026-09-01", isVisible: false },
  ];
  const result = walletAttention(data, new Date("2026-10-03T12:00:00Z"));
  expect(result.review).toBe(1);
  expect(result.debts.map((d) => d.id)).toEqual(["old", "today", "seven"]);
  expect(result.debts[0].pendingAmount).toBeUndefined();
});
test("incomplete attention does not assert zero items; complete review links trigger the queue callback", async () => {
  const data = structuredClone(mockWalletData);
  data.records[0].paymentStatus = "needs_review";
  const review = vi.fn();
  const render = (isComplete: boolean) => (
    <MemoryRouter>
      <WalletAttentionPanel
        dataset={data}
        isComplete={isComplete}
        onReview={review}
      />
    </MemoryRouter>
  );
  await act(async () => {
    tree = create(render(false));
  });
  expect(JSON.stringify(tree!.toJSON())).toContain("Loading complete history");
  expect(tree!.root.findAllByType("button")).toHaveLength(0);
  await act(async () => {
    tree!.update(render(true));
  });
  await act(async () => tree!.root.findByType("button").props.onClick());
  expect(review).toHaveBeenCalledTimes(1);
});
test("refresh is single flight and displays a timestamp only after a successful canonical read", async () => {
  let release!: (value: unknown) => void;
  const refresh = vi.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => {
    tree = create(<WalletRefreshButton refresh={refresh} />);
  });
  await act(async () => {
    tree!.root.findByType("button").props.onClick();
    tree!.root.findByType("button").props.onClick();
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Checked");
  await act(async () => {
    release({});
  });
  expect(JSON.stringify(tree!.toJSON())).toContain("Checked");
  expect(tree!.root.findByType("button").props.disabled).toBe(false);
});
test("failed refresh releases the button for retry", async () => {
  const refresh = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({});
  await act(async () => {
    tree = create(<WalletRefreshButton refresh={refresh} />);
  });
  await act(async () => tree!.root.findByType("button").props.onClick());
  expect(JSON.stringify(tree!.toJSON())).not.toContain("Checked");
  await act(async () => tree!.root.findByType("button").props.onClick());
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(tree!.toJSON())).toContain("Checked");
});
