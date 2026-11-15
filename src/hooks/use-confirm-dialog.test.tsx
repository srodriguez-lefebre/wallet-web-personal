// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import { useConfirmDialog } from "./use-confirm-dialog";

test("confirmation resolves on cancel, accept and unmount without leaving an action pending", async () => {
  const { result, unmount } = renderHook(() => useConfirmDialog());
  const request = { title: "Synthetic confirmation", description: "Review the synthetic change." };
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.confirm(request);
  });
  expect(result.current.confirmationProps.open).toBe(true);
  act(() => result.current.confirmationProps.onOpenChange(false));
  await expect(pending).resolves.toBe(false);
  act(() => {
    pending = result.current.confirm(request);
  });
  act(() => result.current.confirmationProps.onConfirm());
  await expect(pending).resolves.toBe(true);
  act(() => {
    pending = result.current.confirm(request);
  });
  unmount();
  await expect(pending).resolves.toBe(false);
  await expect(result.current.confirm(request)).resolves.toBe(false);
});
