import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "@shared/mock-data";

import { GoalsView } from "./goals-view";
import { InvestmentsView } from "./investments-view";

import { withWalletMetadata } from "@/test/legacy-wallet-view";
import { createActionToastRunner } from "@/lib/action-toast-runner";

let dataset = structuredClone(mockWalletData);
const update = vi.hoisted(() => vi.fn());
const installment = vi.hoisted(() => vi.fn());
const reportedToast = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () =>
    withWalletMetadata({
      dataset,
      updateGoal: update,
      updateInvestment: update,
      addInstallmentPlan: installment,
      getCompleteDataset: async () => dataset,
    }),
}));
vi.mock("@/hooks/wallet-entities", async () => {
  const { legacyEntityHooks } = await import("@/test/legacy-wallet-view");
  const { useWallet } = await import("@/providers/wallet-provider");
  return legacyEntityHooks(useWallet);
});
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({ toast: null, runAction: createActionToastRunner(reportedToast) }),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogDescription: () => null,
  DialogTrigger: () => null,
}));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dataset = structuredClone(mockWalletData);
  dataset.goals = [0, 1].map((index) => ({
    ...mockWalletData.goals[0]!,
    id: `goal-${index}`,
    name: `Synthetic goal ${index}`,
    autoCaptureEnabled: false,
    isVisible: true,
  }));
  dataset.investments = [0, 1].map((index) => ({
    ...mockWalletData.investments[0]!,
    id: `investment-${index}`,
    name: `Synthetic investment ${index}`,
    isVisible: true,
  }));
  update.mockReset().mockResolvedValue(undefined);
  installment.mockReset().mockResolvedValue("synthetic-plan");
  reportedToast.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function save() {
  const button = tree!.root
    .findAllByType("button")
    .find((button) => button.children.includes("Save"))!;
  await act(async () => {
    button.props.onClick();
  });
}

test("failed installment creation retains fields, reports the error and submits once while pending", async () => {
  installment.mockRejectedValue(new Error("Synthetic installment offline"));
  await act(async () => {
    tree = create(<InvestmentsView />);
  });
  for (const [placeholder, value] of [
    ["Installment plan", "Retained plan"],
    ["Total", "120"],
    ["Count", "3"],
  ])
    await act(async () =>
      tree!.root
        .findAllByType("input")
        .find((input) => input.props.placeholder === placeholder)!
        .props.onChange({ target: { value } }),
    );
  const form = tree!.root
    .findAllByType("form")
    .find((form) => form.props.className.includes("sm:grid-cols"))!;
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
    form.props.onSubmit({ preventDefault() {} });
  });
  expect(installment).toHaveBeenCalledTimes(1);
  expect(reportedToast).toHaveBeenCalledWith("error", "Could not create installment");
  expect(
    tree!.root
      .findAllByType("input")
      .find((input) => input.props.placeholder === "Installment plan")!.props.value,
  ).toBe("Retained plan");
});
test.each(["goals", "investments"] as const)(
  "%s batch retry saves only unfinished edited rows",
  async (kind) => {
    const rows = dataset[kind];
    let failed = false;
    update.mockImplementation(async (id: string) => {
      if (id === rows[1]!.id && !failed) {
        failed = true;
        throw new Error("Synthetic second row offline");
      }
    });
    await act(async () => {
      tree = create(kind === "goals" ? <GoalsView /> : <InvestmentsView />);
    });
    await act(async () => tree!.root.findByProps({ "aria-label": `Edit ${kind}` }).props.onClick());
    for (const row of rows) {
      const input = tree!.root
        .findAllByType("input")
        .find((input) => input.props.value === row.name)!;
      await act(async () => input.props.onChange({ target: { value: `${row.name} edited` } }));
    }
    await save();
    expect(update).toHaveBeenCalledTimes(2);
    await save();
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls.map((call) => call[0])).toEqual([
      rows[0]!.id,
      rows[1]!.id,
      rows[1]!.id,
    ]);
  },
);
test.each(["goals", "investments"] as const)(
  "%s unchanged drafts do not submit writes",
  async (kind) => {
    await act(async () => {
      tree = create(kind === "goals" ? <GoalsView /> : <InvestmentsView />);
    });
    await act(async () => tree!.root.findByProps({ "aria-label": `Edit ${kind}` }).props.onClick());
    await save();
    expect(update).not.toHaveBeenCalled();
  },
);

test.each(["goals", "investments"] as const)(
  "%s freezes the complete bulk editor until acknowledgment",
  async (kind) => {
    let release!: () => void;
    update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await act(async () => {
      tree = create(kind === "goals" ? <GoalsView /> : <InvestmentsView />);
    });
    await act(async () => tree!.root.findByProps({ "aria-label": `Edit ${kind}` }).props.onClick());
    const input = tree!.root
      .findAllByType("input")
      .find((input) => input.props.value === dataset[kind][0]!.name)!;
    await act(async () => input.props.onChange({ target: { value: "Synthetic pending edit" } }));
    await save();
    const current = tree!.root
      .findAllByType("input")
      .find((input) => input.props.value === "Synthetic pending edit")!;
    let ancestor = current.parent;
    while (ancestor && !(ancestor.type === "fieldset" && ancestor.props.disabled))
      ancestor = ancestor.parent;
    expect(
      ancestor,
      "all bulk inputs must be inside a disabled fieldset while saving",
    ).not.toBeNull();
    await act(async () => release());
  },
);
