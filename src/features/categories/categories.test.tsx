// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CategoryCreationContext } from "./category-creation-context";
import { CategoryTree } from "./CategoryTree";
import { CategoryFormDialog } from "./CategoryFormDialog";
import { CategoryDeleteDialog } from "./CategoryDeleteDialog";

import { CategoryCombobox } from "@/components/ui/form/category-combobox";

const root = {
  id: "root",
  name: "Café",
  color: "#2563eb",
  icon: "coffee",
  isSystem: false,
  isSelectable: true,
  archivedAt: null,
};
const child = { ...root, id: "child", name: "Breakfast", parentId: root.id };
const deep = { ...root, id: "deep", name: "Pastries", parentId: child.id };
const system = { ...root, id: "system", name: "Others", isSystem: true };
const categories = [root, child, deep, system];
const usage = {
  records: 2,
  cardRecords: 3,
  budgets: 0,
  debts: 0,
  recurringDebts: 0,
  installmentPlans: 0,
  templates: 1,
  merchants: 1,
  lastUsedAt: null,
};
afterEach(cleanup);

test("tree search keeps ancestors and protects system categories", () => {
  render(
    <CategoryTree
      categories={categories}
      usage={{}}
      query="PASTRIES"
      expansion={{}}
      onToggle={vi.fn()}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Actions for Café" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Actions for Breakfast" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Actions for Pastries" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Actions for Others" })).toBeNull();
});

test("one form validates siblings and creates under any depth", async () => {
  const save = vi.fn().mockResolvedValue("created");
  render(
    <CategoryFormDialog
      categories={categories}
      parentId={child.id}
      onSave={save}
      onClose={vi.fn()}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "New category" });
  const name = within(dialog).getByRole("textbox", { name: "Name" });
  fireEvent.change(name, { target: { value: "pastriés" } });
  expect(within(dialog).getByText("A sibling category already has this name.")).toBeTruthy();
  fireEvent.change(name, { target: { value: "Toast" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create category" }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      name: "Toast",
      parentId: child.id,
      color: child.color,
      icon: "tag",
    }),
  );
});

test("merge preview totals every descendant reference before confirmation", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <CategoryDeleteDialog
      categories={[...categories, { ...root, id: "target", name: "Groceries" }]}
      source={root}
      initialMode="merge"
      usage={{
        root: { ...usage, records: 0, cardRecords: 0, templates: 0, merchants: 0 },
        child: usage,
        deep: usage,
      }}
      usageState="ready"
      onRetry={vi.fn()}
      onClose={vi.fn()}
      onSubmit={submit}
    />,
  );
  expect(screen.getByText("4", { exact: true })).toBeTruthy();
  expect(screen.getByText("Pastries", { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Destination category" }));
  fireEvent.click(screen.getByRole("option", { name: "Groceries" }));
  fireEvent.click(screen.getByRole("button", { name: "Merge categories" }));
  await vi.waitFor(() => expect(submit).toHaveBeenCalledWith("target"));
});

test("offers inline creation and returns the created ID to the requesting selector", () => {
  const change = vi.fn();
  const create = vi.fn((name: string, select: (id: string) => void) => {
    expect(name).toBe("Road trip");
    select("created");
  });
  render(
    <CategoryCreationContext.Provider value={create}>
      <CategoryCombobox categories={categories} enableCreation onChange={change} />
    </CategoryCreationContext.Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: " Road trip " } });
  fireEvent.click(screen.getByRole("option", { name: "New category…" }));
  expect(create).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledWith("created");
});

test("a protected system category can be edited but cannot be archived or merged", () => {
  render(
    <CategoryTree
      categories={categories}
      usage={{}}
      query=""
      expansion={{}}
      onToggle={vi.fn()}
      onAction={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions for Others" }));
  expect(screen.getByRole("button", { name: "Archive" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Merge" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Edit" }).hasAttribute("disabled")).toBe(false);
});

test("editing sends just the changed parent and excludes descendants from parent options", async () => {
  const save = vi.fn().mockResolvedValue(child.id);
  render(
    <CategoryFormDialog categories={categories} category={child} onSave={save} onClose={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Parent" }));
  expect(screen.queryByRole("option", { name: "Café / Breakfast / Pastries" })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "Others" }));
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ parentId: system.id }));
});
