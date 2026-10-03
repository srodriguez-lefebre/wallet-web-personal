import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { InvestmentDetailView } from "./investment-detail-view";

const state = vi.hoisted(() => ({
  dataset: undefined as unknown,
  id: "",
  update: vi.fn(),
  messages: [] as Array<{ status: string; message: string }>,
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({ dataset: state.dataset, updateInvestment: state.update }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ investmentId: state.id }),
}));
vi.mock("@/lib/use-action-toast", async () => {
  const { createActionToastRunner } = await import("@/lib/action-toast-runner");
  return {
    useActionToast: () => ({
      toast: null,
      runAction: createActionToastRunner((status, message) =>
        state.messages.push({ status, message }),
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
  state.dataset = dataset;
  state.id = dataset.investments[0].id;
  state.update.mockResolvedValue(undefined);
  state.messages = [];
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function open() {
  await act(async () => {
    tree = create(<InvestmentDetailView />);
  });
  await act(async () => {
    tree!.root
      .findByProps({ "aria-label": "Update current value" })
      .props.onClick();
  });
}
async function change(value: string) {
  await act(async () => {
    tree!.root
      .findByProps({ "aria-label": "Current investment value" })
      .props.onChange({ target: { value } });
  });
}
function submit() {
  return tree!.root
    .findByProps({ "aria-label": "Update investment valuation" })
    .props.onSubmit({ preventDefault: vi.fn() });
}

test("valuation sends only currentValue and accepts a complete loss", async () => {
  await open();
  await change("0");
  await act(async () => {
    await submit();
  });
  expect(state.update).toHaveBeenCalledExactlyOnceWith(state.id, {
    currentValue: 0,
  });
  expect(state.messages.at(-1)?.status).toBe("success");
  expect(
    tree!.root.findAllByProps({ "aria-label": "Update investment valuation" }),
  ).toHaveLength(0);
});
test("two immediate submissions send one request and disable the pending action", async () => {
  let resolve!: () => void;
  state.update.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  await open();
  await change("50");
  let first!: Promise<void>;
  await act(async () => {
    first = submit();
    await submit();
  });
  expect(state.update).toHaveBeenCalledTimes(1);
  expect(
    tree!.root.findByProps({ "aria-label": "Save current value" }).props
      .disabled,
  ).toBe(true);
  await act(async () => {
    resolve();
    await first;
  });
});
test("a failed valuation leaves the form open, shows failure and permits retry", async () => {
  state.update.mockRejectedValueOnce(new Error("offline"));
  await open();
  await change("50");
  await act(async () => {
    await submit();
  });
  expect(
    tree!.root.findAllByProps({ "aria-label": "Update investment valuation" }),
  ).toHaveLength(1);
  expect(state.messages.at(-1)?.status).toBe("error");
  expect(
    tree!.root.findByProps({ "aria-label": "Save current value" }).props
      .disabled,
  ).toBe(false);
  await act(async () => {
    await submit();
  });
  expect(state.update).toHaveBeenCalledTimes(2);
  expect(state.messages.at(-1)?.status).toBe("success");
});
test.each(["", "-1", "NaN", "Infinity"])(
  "invalid valuation %s does not send a request",
  async (value) => {
    await open();
    await change(value);
    await act(async () => {
      await submit();
    });
    expect(state.update).not.toHaveBeenCalled();
    expect(
      tree!.root.findAllByProps({
        "aria-label": "Update investment valuation",
      }),
    ).toHaveLength(1);
  },
);
