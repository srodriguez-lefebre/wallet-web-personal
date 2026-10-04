import type { PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { createActionToastRunner } from "../lib/action-toast-runner";
import { DebtsView } from "./debts-view";

const payment = vi.hoisted(() => vi.fn());
const runnerState = vi.hoisted(() => ({ returnFalseOnFailure: false }));
let dataset = structuredClone(mockWalletData);
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({ dataset, recordDebtPayment: payment }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: async (action: () => Promise<unknown>) => {
      try {
        return await createActionToastRunner(() => {})(action);
      } catch (error) {
        if (runnerState.returnFalseOnFailure) return false;
        throw error;
      }
    },
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
    DialogTrigger: Part,
  };
});
vi.mock("@/components/wallet/category-picker", () => ({
  CategoryPicker: () => null,
}));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  payment.mockReset().mockResolvedValue(undefined);
  runnerState.returnFalseOnFailure = false;
  dataset = structuredClone(mockWalletData);
  dataset.debts = [
    {
      ...dataset.debts[0],
      direction: "payable",
      originalAmount: 200,
      pendingAmount: 200,
      status: "active",
      accountId: dataset.accounts[0].id,
    },
  ];
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

async function pay(path: "partial" | "settle") {
  const button = tree!.root
    .findAllByType("button")
    .find((button) =>
      button.children.includes(path === "partial" ? "Partial" : "Pay"),
    )!;
  await act(async () => {
    await button.props.onClick();
  });
  if (path === "partial")
    await act(async () => {
      await tree!.root
        .findByType("form")
        .props.onSubmit({ preventDefault() {} });
    });
}
test.each(["partial", "settle"] as const)(
  "%s payments retire confirmed keys for a new identical payment",
  async (path) => {
    await act(async () => {
      tree = create(<DebtsView />);
    });
    await pay(path);
    const firstKey = payment.mock.calls[0][1].idempotencyKey;
    await pay(path);
    expect(payment.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  },
);

test("an uncertain partial payment keeps its key for the retry", async () => {
  await act(async () => {
    tree = create(<DebtsView />);
  });
  payment.mockRejectedValueOnce(
    new Error("connection lost after server commit"),
  );
  await expect(pay("partial")).rejects.toThrow(/connection lost/);
  const firstKey = payment.mock.calls[0][1].idempotencyKey;
  await pay("partial");
  expect(payment.mock.calls[1][1].idempotencyKey).toBe(firstKey);
});

test.each(["partial", "settle"] as const)(
  "%s payment retains the key when the toast runner returns false",
  async (path) => {
    runnerState.returnFalseOnFailure = true;
    await act(async () => {
      tree = create(<DebtsView />);
    });
    payment.mockRejectedValueOnce(new Error("reload failed after payment"));
    await pay(path);
    const firstKey = payment.mock.calls[0][1].idempotencyKey;
    await pay(path);
    expect(payment.mock.calls[1][1].idempotencyKey).toBe(firstKey);
  },
);
