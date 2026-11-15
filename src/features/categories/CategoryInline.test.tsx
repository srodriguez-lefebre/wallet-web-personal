// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CategoryCreationProvider } from "./CategoryCreationProvider";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CategoryField } from "@/components/ui/form";

const create = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "new-category" }));
vi.mock("@/hooks/wallet-entities", () => ({
  useWalletReferenceQuery: () => ({ data: { categories: [] } }),
}));
vi.mock("@/providers/wallet-query-provider", () => ({
  useOptionalWalletData: () => null,
  useWalletData: () => ({ mutations: { "categories.create": create } }),
}));
afterEach(cleanup);

test("creates a category inside a movement form and restores focus to the selector", async () => {
  const select = vi.fn();
  render(
    <CategoryCreationProvider>
      <Dialog open>
        <DialogContent>
          <DialogTitle>Movement</DialogTitle>
          <DialogDescription>Categorize your transaction</DialogDescription>
          <CategoryField categories={[]} onChange={select} />
        </DialogContent>
      </Dialog>
    </CategoryCreationProvider>,
  );
  const selector = screen.getByRole("button", { name: "Category" });
  fireEvent.click(selector);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Bicycles" } });
  fireEvent.click(screen.getByRole("option", { name: "New category…" }));
  const categoryForm = screen.getByRole("dialog", { name: "New category" });
  expect(within(categoryForm).getByRole("textbox", { name: "Name" })).toHaveProperty(
    "value",
    "Bicycles",
  );
  fireEvent.click(within(categoryForm).getByRole("button", { name: "Create category" }));
  await waitFor(() => expect(select).toHaveBeenCalledWith("new-category"));
  await waitFor(() => expect(document.activeElement).toBe(selector));
});
