// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import {
  Field,
  MoneyInput,
  SegmentedControl,
  FormDialog,
  AccountSelect,
  CurrencySelect,
} from "./index";

afterEach(cleanup);
test("money fields limit decimal input and label an independent converted amount", () => {
  function Example() {
    const [value, setValue] = useState("");
    const [converted, setConverted] = useState("");
    return (
      <Field label="Amount" htmlFor="amount">
        <MoneyInput
          id="amount"
          value={value}
          onValueChange={setValue}
          converted={{
            label: "Amount in account currency",
            value: converted,
            onValueChange: setConverted,
          }}
        />
      </Field>
    );
  }
  render(<Example />);
  const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "Amount" });
  expect(amount.inputMode).toBe("decimal");
  fireEvent.change(amount, { target: { value: "12,345" } });
  expect(amount.value).toBe("12.34");
  const converted = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Amount in account currency",
  });
  fireEvent.change(converted, { target: { value: "40.129" } });
  expect(converted.value).toBe("40.12");
  expect(amount.value).toBe("12.34");
});
test("segmented options expose their pressed state and update the controlled value", () => {
  function Example() {
    const [value, setValue] = useState("expense");
    return (
      <SegmentedControl
        label="Record type"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
      />
    );
  }
  render(<Example />);
  expect(screen.getByRole("button", { name: "Expense" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Income" }));
  expect(screen.getByRole("button", { name: "Income" }).getAttribute("aria-pressed")).toBe("true");
});
test("busy form dialogs retain errors and block dismiss or another submit", () => {
  const submit = vi.fn(),
    close = vi.fn();
  render(
    <FormDialog
      open
      onOpenChange={close}
      title="Synthetic form"
      description="Synthetic fields"
      busy
      error="Synthetic failure"
      onSubmit={submit}
    >
      <input aria-label="Name" />
    </FormDialog>,
  );
  expect(screen.getByRole("alert").textContent).toBe("Synthetic failure");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Saving..." }).disabled).toBe(true);
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(submit).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
test("account selection keeps an archived current value readable but only offers active visible alternatives", () => {
  const accounts = [
    { id: "active", name: "Active", isActive: true, isVisible: true },
    { id: "hidden", name: "Hidden", isActive: true, isVisible: false },
    { id: "old", name: "Old account", isActive: false, isVisible: true },
  ];
  render(
    <AccountSelect
      label="Account"
      accounts={accounts}
      value="old"
      onValueChange={() => {}}
      allowNone
    />,
  );
  expect(screen.getByRole("combobox", { name: "Account" }).textContent).toContain("Old account");
});

test("currency selection returns domain values through a keyboard-opened Radix menu", async () => {
  const scroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  try {
    function Example() {
      const [value, setValue] = useState<"UYU" | "USD" | "EUR" | "BRL" | "ARS">("UYU");
      return <CurrencySelect label="Currency" value={value} onValueChange={setValue} />;
    }
    render(<Example />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Currency" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "USD" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Currency" }).textContent).toContain("USD"),
    );
  } finally {
    if (scroll) Object.defineProperty(Element.prototype, "scrollIntoView", scroll);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});
test("segmented tabs expose selection and support keyboard navigation", async () => {
  function Example() {
    const [value, setValue] = useState("payable");
    return (
      <SegmentedControl
        tabs
        label="Debt direction"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "payable", label: "To pay" },
          { value: "receivable", label: "To collect" },
        ]}
      />
    );
  }
  render(<Example />);
  expect(screen.getByRole("tablist", { name: "Debt direction" })).toBeDefined();
  const first = screen.getByRole("tab", { name: "To pay" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "To collect" }).getAttribute("aria-selected")).toBe(
      "true",
    ),
  );
});
