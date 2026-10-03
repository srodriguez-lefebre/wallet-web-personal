import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../../shared/mock-data";
import { DataHealthPanel } from "./data-health-panel";
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (work: () => Promise<unknown>) => work(),
  }),
}));
let tree: ReactTestRenderer | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
test("data check uses one complete snapshot for repeated clicks and opens the review queue", async () => {
  let release!: (value: typeof mockWalletData) => void;
  const snapshot = vi.fn(
      () =>
        new Promise<typeof mockWalletData>((resolve) => {
          release = resolve;
        }),
    ),
    review = vi.fn();
  await act(async () => {
    tree = create(
      <DataHealthPanel
        getSnapshot={snapshot}
        onReview={review}
        onRecords={vi.fn()}
        onCards={vi.fn()}
      />,
    );
  });
  let pending!: Promise<void>;
  await act(async () => {
    const button = tree!.root.findByType("button");
    pending = button.props.onClick();
    button.props.onClick();
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
  const data = structuredClone(mockWalletData);
  data.records[0].paymentStatus = "needs_review";
  await act(async () => {
    release(data);
    await pending;
  });
  const button = tree!.root
    .findAllByType("button")
    .find((button) =>
      button
        .findAllByType("p")
        .some((p) => p.children.includes("Needs review")),
    )!;
  expect(button.findAllByType("p")[1].children).toEqual(["1"]);
  await act(async () => button.props.onClick());
  expect(review).toHaveBeenCalledTimes(1);
});
test("a failed data check gives feedback and can be retried", async () => {
  const snapshot = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(mockWalletData);
  await act(async () => {
    tree = create(
      <DataHealthPanel
        getSnapshot={snapshot}
        onReview={vi.fn()}
        onRecords={vi.fn()}
        onCards={vi.fn()}
      />,
    );
  });
  await act(async () => tree!.root.findByType("button").props.onClick());
  expect(tree!.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Retry",
  );
  await act(async () => tree!.root.findByType("button").props.onClick());
  expect(snapshot).toHaveBeenCalledTimes(2);
  expect(tree!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
});
