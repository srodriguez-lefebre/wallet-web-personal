import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useContext, useId, useRef, useState } from "react";
import {
  categoryMatchesKind,
  selectableCategory,
  type MovementCategoryKind,
} from "@shared/categories";

import { useRecentCategoryPage } from "./use-recent-category-page";
import { Input, controlClassName } from "./controls";

import type { Category } from "@shared/types";
import type { KeyboardEvent } from "react";

import { CategoryCreationContext } from "@/features/categories/category-creation-context";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { categoryPaths, normalizeCategoryName } from "@/lib/category-options";
import { cn } from "@/lib/utils";

type Choice = {
  key: string;
  label: string;
  category?: Category;
  depth?: number;
  create?: true;
};

export interface CategoryComboboxProps {
  categories: Category[];
  value?: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  showRecent?: boolean;
  disabled?: boolean;
  filter?: (category: Category) => boolean;
  enableCreation?: boolean;
  kind?: MovementCategoryKind;
}

export function CategoryCombobox({
  categories,
  value = "",
  onChange,
  id,
  label = "Category",
  emptyLabel = "None",
  allowEmpty = false,
  placeholder = allowEmpty ? emptyLabel : "Choose category",
  showRecent = true,
  disabled,
  filter = selectableCategory,
  enableCreation = false,
  kind,
}: CategoryComboboxProps) {
  const requestCreation = useContext(CategoryCreationContext);
  const handoff = useRef(false);
  const listId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabDirection = useRef<1 | -1>(undefined);
  const valueId = `${listId}-value`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const pathEntries = categoryPaths(categories);
  const selected = pathEntries.find(({ category }) => category.id === value);
  const term = normalizeCategoryName(query);
  const visible = pathEntries.filter(
    ({ category, path }) =>
      filter(category) &&
      categoryMatchesKind(category, kind) &&
      (!term || normalizeCategoryName(path).includes(term)),
  );
  const firstPage = useRecentCategoryPage(open && showRecent && !term);
  const recentIds = new Set(firstPage?.items.map(({ categoryId }) => categoryId));
  const recents: Choice[] = [...recentIds]
    .flatMap((categoryId) => {
      const entry = visible.find(({ category }) => category.id === categoryId);
      return entry
        ? [{ key: `recent-${entry.category.id}`, label: entry.path, category: entry.category }]
        : [];
    })
    .slice(0, 5);
  const recentChoices = new Set(recents.map(({ category }) => category?.id));
  const groups = new Map<string, { label: string; choices: Choice[] }>();
  for (const { root, category, path, depth } of visible) {
    if (recentChoices.has(category.id)) continue;
    let group = groups.get(root.id);
    if (!group) {
      group = { label: root.name, choices: [] };
      groups.set(root.id, group);
    }
    group.choices.push({ key: category.id, label: path, category, depth });
  }
  const empty = allowEmpty && !term ? [{ key: "empty", label: emptyLabel }] : [];
  const create: Choice[] =
    enableCreation && requestCreation
      ? [{ key: "create", label: "New category…", create: true }]
      : [];
  const choices = [
    ...empty,
    ...recents,
    ...[...groups.values()].flatMap((group) => group.choices),
    ...create,
  ];
  const active = cursor < 0 ? undefined : choices[Math.min(cursor, choices.length - 1)];
  const optionId = (choice: Choice) => `${listId}-${choice.key}`;

  function changeOpen(next: boolean) {
    setOpen(next);
    setQuery("");
    setCursor(-1);
  }

  function choose(choice: Choice) {
    changeOpen(false);
    if (choice.create) {
      handoff.current = true;
      requestCreation?.(query.trim(), onChange, () => trigger.current?.focus(), kind);
    } else {
      onChange(choice.category?.id ?? "");
    }
  }

  function focusAdjacentControl() {
    const button = trigger.current;
    if (!button || tabDirection.current === undefined) return;
    const direction = tabDirection.current;
    tabDirection.current = undefined;
    const scope = button.closest('[role="dialog"]') ?? document.body;
    const controls = [
      ...scope.querySelectorAll<HTMLElement>(
        "button, input, select, textarea, a[href], summary, [tabindex]",
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[hidden], [inert], [aria-hidden=true]") &&
        getComputedStyle(element).visibility !== "hidden" &&
        getComputedStyle(element).display !== "none",
    );
    const index = controls.indexOf(button);
    const next = index >= 0 ? controls[index + direction] : undefined;
    (next ?? button).focus();
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (active) choose(active);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !choices.length) return;
    event.preventDefault();
    const index = active ? choices.indexOf(active) : -1;
    const last = choices.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowDown"
            ? Math.min(index + 1, last)
            : index < 0
              ? last
              : Math.max(index - 1, 0);
    setCursor(next);
    document.getElementById(optionId(choices[next]!))?.scrollIntoView?.({ block: "nearest" });
  }

  function option(choice: Choice) {
    const chosen = !choice.create && (choice.category?.id ?? "") === value;
    return (
      <div
        id={optionId(choice)}
        key={choice.key}
        role="option"
        aria-label={choice.label}
        aria-selected={chosen}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(choice)}
        className={cn(
          "flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-secondary",
          active?.key === choice.key && "bg-secondary",
        )}
        style={
          choice.depth ? { paddingInlineStart: `${Math.min(choice.depth, 8) + 0.5}rem` } : undefined
        }
      >
        {choice.create && <Plus className="h-4 w-4 shrink-0" aria-hidden />}
        {choice.category && (
          <CategoryIcon icon={choice.category.icon} color={choice.category.color} size="sm" />
        )}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {choice.depth ? choice.category?.name : choice.label}
        </span>
        {chosen && <Check className="h-4 w-4 shrink-0" aria-hidden />}
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          aria-label={label}
          aria-describedby={valueId}
          ref={trigger}
          disabled={disabled}
          className={cn(
            controlClassName,
            "flex min-w-0 items-center justify-between gap-2 text-left",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && (
              <CategoryIcon
                icon={selected.category.icon}
                color={selected.category.color}
                size="sm"
              />
            )}
            <span id={valueId} className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.path ?? placeholder}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={label + " options"}
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onKeyDownCapture={(event) => {
            if (event.key !== "Tab") return;
            event.preventDefault();
            tabDirection.current = event.shiftKey ? -1 : 1;
            changeOpen(false);
          }}
          onCloseAutoFocus={(event) => {
            if (handoff.current) {
              handoff.current = false;
              event.preventDefault();
              return;
            }
            if (tabDirection.current === undefined) return;
            event.preventDefault();
            focusAdjacentControl();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInput.current?.focus();
          }}
          className="z-50 flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[max(14rem,var(--radix-popover-trigger-width))] max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-md border bg-card p-1 text-card-foreground shadow-md"
        >
          <Input
            ref={searchInput}
            role="combobox"
            aria-label="Search categories"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={active && optionId(active)}
            placeholder="Search categories"
            className="h-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(-1);
            }}
            onKeyDown={handleKey}
          />
          {!visible.length && (
            <p role="status" className="px-2 py-1 text-sm text-muted-foreground">
              No matching categories.
            </p>
          )}
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            {empty.map(option)}
            {recents.length > 0 && (
              <div role="group" aria-label="Recent categories">
                <div className="px-2 pt-2 text-xs font-medium text-muted-foreground">Recent</div>
                {recents.map(option)}
              </div>
            )}
            {[...groups.entries()].map(([key, group]) => (
              <div
                key={key}
                role="group"
                aria-label={group.label}
                className="border-t first:border-t-0"
              >
                {group.choices.map(option)}
              </div>
            ))}
            {create.map(option)}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
