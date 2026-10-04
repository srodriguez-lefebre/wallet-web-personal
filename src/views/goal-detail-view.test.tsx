import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { WalletDataset } from "../../shared/types";
import { GoalDetailView } from "./goal-detail-view";

const state = vi.hoisted(() => ({
  dataset: undefined as unknown,
  id: "",
  update: vi.fn(),
  messages: [] as string[],
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset: state.dataset,
    updateGoal: state.update,
    setRecordFilters: vi.fn(),
    releaseGoalReservation: vi.fn(),
  }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ goalId: state.id }),
}));
vi.mock("@/lib/use-action-toast", async () => {
  const { createActionToastRunner } = await import("@/lib/action-toast-runner");
  return {
    useActionToast: () => ({
      toast: null,
      runAction: createActionToastRunner((status) =>
        state.messages.push(status),
      ),
    }),
  };
});
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
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const dataset = structuredClone(mockWalletData);
  dataset.goals[0].id = "00000000-0000-4000-8000-000000000003";
  dataset.goals[0].accountId = undefined;
  dataset.goals[0].autoReservationAccountId = undefined;
  dataset.goals[0].status = "active";
  state.dataset = dataset;
  state.id = dataset.goals[0].id;
  state.update.mockResolvedValue(undefined);
  state.messages = [];
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function open(label: string) {
  await act(async () => {
    tree = create(<GoalDetailView />);
  });
  await act(async () => {
    tree!.root.findByProps({ "aria-label": label }).props.onClick();
  });
}
async function change(label: string, value: string) {
  await act(async () => {
    tree!.root
      .findByProps({ "aria-label": label })
      .props.onChange({ target: { value } });
  });
}
const save = () =>
  tree!.root
    .findByProps({ "aria-label": "Edit goal details" })
    .props.onSubmit({ preventDefault: vi.fn() });

test("completed goal keeps its target and totals but hides remaining funding and fills the bar", async () => {
  const dataset = state.dataset as WalletDataset;
  dataset.goals[0].status = "completed";
  dataset.goals[0].targetAmount = 999999;
  await act(async () => { tree = create(<GoalDetailView />); });
  const content = JSON.stringify(tree!.toJSON());
  expect(content).toContain("Reserved");
  expect(content).toContain("Spent");
  expect(content).not.toContain("Still needed");
  expect(content).not.toContain("Remaining");
  expect(content).not.toContain("Committed");
  expect(tree!.root.findByProps({ "aria-label": "Completed goal" }).props["aria-valuenow"]).toBe(100);
  expect(dataset.goals[0].targetAmount).toBe(999999);
});

test("detail editing validates and saves through the persisted goal action", async () => {
  await open("Edit goal");
  await change("Goal name", "  Updated trip  ");
  await change("Goal target amount", "0");
  await act(async () => {
    await save();
  });
  expect(state.update).not.toHaveBeenCalled();
  await change("Goal target amount", "8000");
  await act(async () => {
    await save();
  });
  expect(state.update).toHaveBeenCalledExactlyOnceWith(
    state.id,
    expect.objectContaining({ name: "Updated trip", targetAmount: 8000 }),
  );
  expect(state.messages.at(-1)).toBe("success");
  expect(
    tree!.root.findAllByProps({ "aria-label": "Edit goal details" }),
  ).toHaveLength(0);
});

test("closing below target submits completion and keeps failure retryable", async () => {
  state.update.mockRejectedValueOnce(new Error("offline"));
  await open("Close goal");
  const close = () =>
    tree!.root
      .findByProps({ "aria-label": "Complete goal and release reservations" })
      .props.onClick();
  await act(async () => {
    await close();
  });
  expect(state.update).toHaveBeenCalledExactlyOnceWith(state.id, {
    status: "completed",
  });
  expect(state.messages.at(-1)).toBe("error");
  expect(
    tree!.root.findByProps({
      "aria-label": "Complete goal and release reservations",
    }).props.disabled,
  ).toBe(false);
  await act(async () => {
    await close();
  });
  expect(state.update).toHaveBeenCalledTimes(2);
  expect(state.messages.at(-1)).toBe("success");
});

test("immediate repeated close clicks send one completion while pending", async () => {
  let resolve!: () => void;
  state.update.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  await open("Close goal");
  const close = () =>
    tree!.root
      .findByProps({ "aria-label": "Complete goal and release reservations" })
      .props.onClick();
  let first!: Promise<void>;
  await act(async () => {
    first = close();
    await close();
  });
  expect(state.update).toHaveBeenCalledTimes(1);
  expect(
    tree!.root.findByProps({
      "aria-label": "Complete goal and release reservations",
    }).props.disabled,
  ).toBe(true);
  await act(async () => {
    resolve();
    await first;
  });
});

test("a completed goal cannot be closed again from the detail action", async () => {
  (state.dataset as WalletDataset).goals[0].status = "completed";
  await act(async () => {
    tree = create(<GoalDetailView />);
  });
  expect(
    tree!.root.findByProps({ "aria-label": "Close goal" }).props.disabled,
  ).toBe(true);
});
