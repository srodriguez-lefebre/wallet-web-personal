import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import { createActionToastRunner } from "../lib/action-toast-runner";
import { AccountsView } from "./accounts-view";

const actions = vi.hoisted(() => ({
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  setPrimaryAccount: vi.fn(),
  setRecordFilters: vi.fn(),
}));
let dataset = structuredClone(mockWalletData);
let complete = true;
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({ dataset, ...actions, isAllHistoryComplete: complete }),
}));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: createActionToastRunner(() => {}),
  }),
}));
vi.mock("@/components/ui/dialog", () => {
  const part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return Object.fromEntries(
    [
      "Dialog",
      "DialogContent",
      "DialogHeader",
      "DialogTitle",
      "DialogDescription",
      "DialogTrigger",
    ].map((name) => [name, part]),
  );
});
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  complete = true;
  dataset = structuredClone(mockWalletData);
  dataset.accounts = dataset.accounts.slice(0, 2);
  dataset.settings.primaryAccountId = dataset.accounts[0].id;
  actions.addAccount.mockResolvedValue("created");
  actions.updateAccount.mockResolvedValue(undefined);
  actions.deleteAccount.mockResolvedValue(undefined);
  actions.setPrimaryAccount.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(<AccountsView />);
  });
}
async function edit() {
  await mount();
  await act(async () =>
    tree!.root.findByProps({ "aria-label": "Edit accounts" }).props.onClick(),
  );
}
function save() {
  return tree!.root
    .findAllByType("button")
    .find((button) => button.children.includes("Save"))!;
}
function submit() {
  return tree!.root.findByType("form").props.onSubmit({ preventDefault() {} });
}

test("saving unchanged drafts sends no account or settings mutations", async () => {
  await edit();
  await act(async () => save().props.onClick());
  expect(actions.updateAccount).not.toHaveBeenCalled();
  expect(actions.setPrimaryAccount).not.toHaveBeenCalled();
});
test("save failure retains drafts and retries only the unfinished changes", async () => {
  actions.updateAccount.mockImplementation(async (id: string) => {
    if (
      id === dataset.accounts[1].id &&
      actions.updateAccount.mock.calls.filter((call) => call[0] === id)
        .length === 1
    )
      throw new Error("Offline");
  });
  await edit();
  const names = tree!.root.findAllByProps({ placeholder: "Account name" });
  await act(async () => {
    names[0].props.onChange({ target: { value: "First edited" } });
    names[1].props.onChange({ target: { value: "Second edited" } });
  });
  await act(async () => {
    await save()
      .props.onClick()
      .catch(() => {});
  });
  expect(
    tree!.root
      .findAllByProps({ placeholder: "Account name" })
      .map((input) => input.props.value),
  ).toEqual(["First edited", "Second edited"]);
  await act(async () => {
    await save()
      .props.onClick()
      .catch(() => {});
  });
  expect(
    actions.updateAccount.mock.calls.filter(
      (call) => call[0] === dataset.accounts[0].id,
    ),
  ).toHaveLength(1);
  expect(
    actions.updateAccount.mock.calls.filter(
      (call) => call[0] === dataset.accounts[1].id,
    ),
  ).toHaveLength(2);
});
test("creating succeeds once even when the primary-account step needs a retry", async () => {
  dataset.settings.primaryAccountId = undefined;
  actions.setPrimaryAccount.mockRejectedValueOnce(
    new Error("Settings unavailable"),
  );
  await mount();
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Banco, efectivo, tarjeta..." })
      .props.onChange({ target: { value: "New bank" } }),
  );
  await act(async () => {
    await submit().catch(() => {});
  });
  await act(async () => {
    await submit().catch(() => {});
  });
  expect(actions.addAccount).toHaveBeenCalledTimes(1);
  expect(actions.setPrimaryAccount).toHaveBeenCalledTimes(2);
});
test("double creation submits a single request and preserves the form after failure", async () => {
  let fail!: (reason: Error) => void;
  actions.addAccount.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  await mount();
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Banco, efectivo, tarjeta..." })
      .props.onChange({ target: { value: "Retained bank" } }),
  );
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  await act(async () => {
    first = submit();
    second = submit();
  });
  expect(actions.addAccount).toHaveBeenCalledTimes(1);
  await act(async () => {
    fail(new Error("Offline"));
    await Promise.allSettled([first, second]);
  });
  expect(
    tree!.root.findByProps({ placeholder: "Banco, efectivo, tarjeta..." }).props
      .value,
  ).toBe("Retained bank");
});
test("incomplete history withholds account balances and displays its loading state", async () => {
  complete = false;
  await mount();
  expect(
    tree!.root
      .findAllByType("div")
      .filter((node) => node.props.role === "button"),
  ).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain(
    "Loading complete history to calculate current balances",
  );
});

test("a successful archive is not repeated when another account save fails", async () => {
  actions.updateAccount.mockRejectedValueOnce(new Error("Offline"));
  await edit();
  await act(async () =>
    tree!.root
      .findAllByProps({ "aria-label": "Archive account" })[0]
      .props.onClick(),
  );
  await act(async () =>
    tree!.root
      .findByProps({ placeholder: "Account name" })
      .props.onChange({ target: { value: "Retained edit" } }),
  );
  await act(async () => save().props.onClick());
  expect(actions.deleteAccount).toHaveBeenCalledTimes(1);
  await act(async () => save().props.onClick());
  expect(actions.deleteAccount).toHaveBeenCalledTimes(1);
  expect(actions.updateAccount).toHaveBeenCalledTimes(2);
});

test("primary selection is single flight and a failure remains visible", async () => {
  let reject!: (error: Error) => void;
  actions.setPrimaryAccount.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await mount();
  const button = tree!.root
    .findAllByType("button")
    .find((item) => item.children.includes("Set primary"))!;
  await act(async () => {
    button.props.onClick({ stopPropagation() {} });
    button.props.onClick({ stopPropagation() {} });
  });
  expect(actions.setPrimaryAccount).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Cannot save settings")));
  expect(JSON.stringify(tree!.toJSON())).toContain("Cannot save settings");
});

test("revealing a hidden account preserves the existing account cards and their balance values", async () => {
  dataset.accounts[1].isVisible = false;
  await mount();
  const accountCards = () =>
    tree!.root
      .findAllByType("div")
      .filter((node) => node.props.role === "button");
  expect(accountCards()).toHaveLength(1);
  const originalBalance = accountCards()[0]
    .findByProps({ className: "text-3xl font-semibold" })
    .children.join("");
  await act(async () =>
    tree!.root
      .findByProps({ "aria-label": "Show hidden accounts" })
      .props.onClick(),
  );
  expect(accountCards()).toHaveLength(2);
  expect(
    accountCards()[0]
      .findByProps({ className: "text-3xl font-semibold" })
      .children.join(""),
  ).toBe(originalBalance);
});
