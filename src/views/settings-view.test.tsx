import { act, create } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { mockWalletData } from "../../shared/mock-data";
import type { SettingsPatch } from "../../shared/schemas";
import { SettingsView } from "./settings-view";

const update = vi.hoisted(() => vi.fn());
const addTag = vi.hoisted(() => vi.fn());
vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    dataset: mockWalletData,
    updateWalletSettings: update,
    addTag,
  }),
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ lock: vi.fn() }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (action: () => Promise<unknown>) => action(),
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("settings provide the template management section", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<SettingsView />);
  });
  try {
    expect(JSON.stringify(tree.toJSON())).toContain("Gestión de plantillas");
  } finally {
    await act(async () => tree.unmount());
  }
});

test("failed tag creation preserves the draft and handles the rejected request", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  addTag.mockRejectedValue(new Error("offline"));
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<SettingsView />);
  });
  try {
    await act(async () => {
      tree.root
        .findByProps({ placeholder: "New tag" })
        .props.onChange({ target: { value: "Retain draft" } });
    });
    const form = tree.root.findByProps({ placeholder: "New tag" }).parent!;
    await act(async () => {
      await expect(
        form.props.onSubmit({ preventDefault: vi.fn() }),
      ).resolves.toBeUndefined();
    });
    expect(tree.root.findByProps({ placeholder: "New tag" }).props.value).toBe(
      "Retain draft",
    );
    expect(addTag).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => tree.unmount());
  }
});

test("saving defaults while a theme patch is queued does not revert the theme", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const persisted = { ...mockWalletData.settings };
  let release!: () => void;
  const pendingTheme = new Promise<void>((resolve) => {
    release = resolve;
  });
  let queue = Promise.resolve();
  update.mockImplementation((patch: SettingsPatch) => {
    queue = queue.then(async () => {
      if (patch.theme === "dark") await pendingTheme;
      Object.assign(persisted, patch);
    });
    return queue;
  });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<SettingsView />);
  });
  await act(async () => {
    tree.root
      .findByProps({ "aria-label": "Theme" })
      .props.onChange({ target: { value: "dark" } });
    tree.root
      .findAllByType("button")
      .find((button) => button.props.className?.includes("self-end"))!
      .props.onClick();
    release();
    await queue;
  });
  expect(persisted.theme).toBe("dark");
  expect(update.mock.calls[1][0]).not.toHaveProperty(
    "includeHiddenAccountsInReports",
  );
  await act(async () => tree.unmount());
});
