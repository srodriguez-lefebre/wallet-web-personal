// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CategoryCombobox } from "./category-combobox";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { recordsKey } from "@/services/wallet-queries";

const root = { id: "root", name: "Café", color: "#2563eb", icon: "tag" };
const child = { ...root, id: "child", name: "Breakfast", parentId: root.id };
const other = { ...root, id: "other", name: "Shopping" };
const system = { ...root, id: "system", name: "Unknown expense", systemKey: "unknown_expense" };
const categories = [other, child, root, system];
afterEach(cleanup);

test("opens the category tree and selects a child by its parent's name with the keyboard", () => {
  const onChange = vi.fn();
  render(<CategoryCombobox categories={categories} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  const search = screen.getByRole("combobox", { name: "Search categories" });
  expect(document.activeElement).toBe(search);
  expect(screen.getByRole("option", { name: "Shopping" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Unknown expense" })).toBeNull();
  fireEvent.change(search, { target: { value: "CAFE" } });
  expect(screen.queryByRole("option", { name: "Shopping" })).toBeNull();
  fireEvent.keyDown(search, { key: "End" });
  expect(search.getAttribute("aria-activedescendant")).toBe(
    screen.getByRole("option", { name: "Café / Breakfast" }).id,
  );
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith(child.id);
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("uses first-page recent categories and supports an empty option and a custom filter", () => {
  const cache = new QueryClient();
  cache.setQueryData(recordsKey(), {
    pages: [
      { items: [{ categoryId: child.id }, { categoryId: child.id }, { categoryId: other.id }] },
      { items: [{ categoryId: root.id }] },
    ],
  });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={cache}>
      <CategoryCombobox
        categories={categories}
        value={child.id}
        onChange={onChange}
        emptyLabel="All categories"
        allowEmpty
        filter={(category) => category.id !== other.id}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  const recents = screen.getByRole("group", { name: "Recent categories" });
  expect(within(recents).getAllByRole("option")).toHaveLength(1);
  expect(within(recents).getByRole("option", { name: "Café / Breakfast" })).toBeTruthy();
  const search = screen.getByRole("combobox");
  fireEvent.keyDown(search, { key: "Home" });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith("");
});

test("Tab leaves the picker and advances in a modal form", async () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Movement</DialogTitle>
        <CategoryCombobox categories={categories} onChange={vi.fn()} />
        <input aria-label="Note" />
      </DialogContent>
    </Dialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Note" })),
  );
});
