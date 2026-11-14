import { mockWalletData } from "@shared/mock-data";
import { act, create } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";

import { SettingsView } from "./settings-view";

import type { SettingsPatch } from "@shared/schemas";

import * as walletApi from "@/services/wallet-api";

const auth = vi.hoisted(() => ({ lock: vi.fn(), token: undefined as string | undefined }));
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
  useAuth: () => auth,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/use-action-toast", () => ({
  useActionToast: () => ({
    toast: null,
    runAction: (action: () => Promise<unknown>) => action(),
  }),
}));
afterEach(() => {
  auth.token = undefined;
  vi.restoreAllMocks();
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
      expect(form.props.onSubmit({ preventDefault: vi.fn() })).toBeUndefined();
    });
    expect(tree.root.findByProps({ placeholder: "New tag" }).props.value).toBe("Retain draft");
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
    tree.root.findByProps({ "aria-label": "Theme" }).props.onChange({ target: { value: "dark" } });
    tree.root
      .findAllByType("button")
      .find((button) => button.props.className?.includes("self-end"))!
      .props.onClick();
    release();
    await queue;
  });
  expect(persisted.theme).toBe("dark");
  expect(update.mock.calls[1]![0]).not.toHaveProperty("includeHiddenAccountsInReports");
  await act(async () => tree.unmount());
});

test("the optional lock-all control appears only when supported and clears the local session after success", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.token = "synthetic-session";
  vi.spyOn(walletApi, "getSessionCapabilities").mockResolvedValue({ revocable: true });
  const revoke = vi.spyOn(walletApi, "lockAllSessions").mockResolvedValue({ locked: true });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<SettingsView />);
  });
  try {
    const button = tree.root
      .findAllByType("button")
      .find((b) => b.children.includes("Lock all sessions"));
    expect(button).toBeDefined();
    await act(async () => {
      button!.props.onClick();
    });
    expect(revoke).toHaveBeenCalledWith("synthetic-session");
    expect(auth.lock).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => tree.unmount());
  }
});
test("disabled revocation never renders the lock-all action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.token = "synthetic-session";
  vi.spyOn(walletApi, "getSessionCapabilities").mockResolvedValue({ revocable: false });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<SettingsView />);
  });
  try {
    expect(
      tree.root.findAllByType("button").some((b) => b.children.includes("Lock all sessions")),
    ).toBe(false);
  } finally {
    await act(async () => tree.unmount());
  }
});
