// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { memo, useEffect } from "react";
import { afterEach, expect, test } from "vitest";

import { WalletUIProvider, useWalletUIActions, useWalletUIState } from "./wallet-ui-provider";

let actions: ReturnType<typeof useWalletUIActions>;
let state: ReturnType<typeof useWalletUIState>;
function Probe() {
  const current = useWalletUIState();
  const commands = useWalletUIActions();
  useEffect(() => {
    state = current;
    actions = commands;
  }, [current, commands]);
  return (
    <p>
      {current.selectedMonth}:{current.selectedPeriodMode}
    </p>
  );
}
function mount() {
  render(
    <WalletUIProvider
      initialMonth="2026-11"
      initialAccountId="synthetic-account"
      initialCustomRange={{ from: "2026-11-01", to: "2026-11-07" }}
    >
      <Probe />
    </WalletUIProvider>,
  );
}
afterEach(cleanup);
test("the global review queue restores its first context across edits and repeated opens", () => {
  mount();
  act(() => actions.setRecordFilters({ search: "initial", categoryId: "synthetic-category" }));
  act(() => actions.openReviewQueue());
  expect(state.recordFilters).toEqual({ type: "all", paymentStatus: "needs_review" });
  expect(state.selectedPeriodMode).toBe("all");
  act(() => actions.setRecordFilters({ search: "inside queue" }));
  act(() => actions.openReviewQueue());
  act(() => actions.setSelectedMonth("2026-10"));
  act(() => actions.closeReviewQueue());
  expect(state.recordFilters).toEqual({
    type: "all",
    accountId: "synthetic-account",
    search: "initial",
    categoryId: "synthetic-category",
  });
  expect(state.selectedMonth).toBe("2026-11");
  expect(state.selectedPeriodMode).toBe("month");
  expect(state.reviewReturnContext).toBeNull();
});
test("manual review filtering and clearing preserve merge semantics without opening a global queue", () => {
  mount();
  act(() => actions.setRecordFilters({ paymentStatus: "needs_review", search: "manual" }));
  expect(state.reviewReturnContext).toBeNull();
  act(() => actions.closeReviewQueue());
  expect(state.recordFilters).toMatchObject({
    accountId: "synthetic-account",
    search: "manual",
    paymentStatus: "all",
  });
  act(() => actions.openReviewQueue());
  act(() => actions.setRecordFilters({ paymentStatus: "cleared", accountId: undefined }));
  expect(state.reviewReturnContext).toBeNull();
  expect(state.recordFilters.accountId).toBeUndefined();
  act(() => actions.clearRecordFilters());
  expect(state.recordFilters).toEqual({ type: "all" });
});
test("new-record requests use the current default account, retain template and can be consumed", () => {
  mount();
  act(() => actions.openReviewQueue());
  act(() =>
    actions.requestNewRecord({ accountId: "updated-default", templateId: "synthetic-template" }),
  );
  expect(state.recordFilters).toEqual({ type: "all", accountId: "updated-default" });
  expect(state.newRecordTemplateId).toBe("synthetic-template");
  expect(state.reviewReturnContext).toBeNull();
  const previous = state.newRecordRequestId;
  act(() => actions.requestNewRecord({ accountId: "updated-default" }));
  expect(state.newRecordRequestId).toBeGreaterThan(previous);
  act(() => actions.consumeNewRecordRequest());
  expect(state.newRecordRequestId).toBe(0);
  expect(state.newRecordTemplateId).toBeNull();
  act(() => actions.setCustomDateRange({ from: "2026-11-20", to: "2026-11-02" }));
  expect(state.customDateRange).toEqual({ from: "2026-11-02", to: "2026-11-20" });
});
test("state changes do not rerender consumers subscribed only to stable UI actions", () => {
  let renders = 0;
  const Commands = memo(function Commands() {
    const value = useWalletUIActions();
    renders++;
    return <button onClick={() => value.setSelectedMonth("2026-10")}>Previous month</button>;
  });
  render(
    <WalletUIProvider initialMonth="2026-11">
      <Commands />
      <Probe />
    </WalletUIProvider>,
  );
  expect(renders).toBe(1);
  act(() => screen.getByText("Previous month").click());
  expect(screen.getByText("2026-10:month")).toBeDefined();
  expect(renders).toBe(1);
});
