import { currencySchema } from "@shared/schemas";
import {
  ArrowRight,
  Banknote,
  ChevronDown,
  ChevronRight,
  Eye,
  Plus,
  Save,
  Settings2,
  Tags,
  Target,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ActionToastOptions } from "@/lib/action-toast-runner";
import type { Category, CurrencyCode, Tag } from "@shared/types";

import { CategoryCombobox } from "@/components/ui/form/category-combobox";
import {
  controlClassName as fieldClassName,
  inlineControlClassName as inlineFieldClassName,
  colorControlClassName as colorInputClassName,
  ColorInput,
  Input,
} from "@/components/ui/form/controls";
import { ConfirmDialog } from "@/components/ui/form/dialogs";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useDraftFields } from "@/hooks/use-draft-fields";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/wallet/category-icon";
import { categoryIconOptions } from "@/components/wallet/category-icons";
import { RecordTemplateManager } from "@/components/wallet/record-template-manager";
import { finishAction } from "@/lib/async-event";
import { paymentDefaults } from "@/lib/preferences";
import { useActionToast } from "@/lib/use-action-toast";
import { useAuth } from "@/providers/auth-provider";
import { useWallet } from "@/providers/wallet-provider";

type TagDraft = Omit<Tag, "id">;
type CategoryDraft = Omit<Category, "id">;

function childCategories(categories: Category[], parentId: string) {
  return categories
    .filter((category) => category.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SettingsView() {
  const { confirm, confirmationProps } = useConfirmDialog();
  const navigate = useNavigate();
  const {
    dataset,
    setRecordFilters,
    addCategory,
    updateCategory,
    deleteCategory,
    addTag,
    updateTag,
    deleteTag,
    addBudget,
    updateBudget,
    deleteBudget,
    updateWalletSettings,
  } = useWallet();
  const { lock, expiresAt, token, client } = useAuth();
  const [sessionControl, setSessionControl] = useState<"disabled" | "ready" | "busy">("disabled");
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void client["auth.session"]()
      .then((result) => {
        if (!cancelled) setSessionControl(result.revocable ? "ready" : "disabled");
      })
      .catch(() => {
        if (!cancelled) setSessionControl("disabled");
      });
    return () => {
      cancelled = true;
    };
  }, [client, token]);
  const { toast, runAction } = useActionToast();
  async function closeAllSessions() {
    if (!token || sessionControl !== "ready") return;
    setSessionControl("busy");
    const ok = await runSettingAction(() => client["auth.lockAll"](), {
      processing: "Locking all sessions...",
      success: "All sessions locked",
      error: "Could not lock all sessions",
    });
    if (ok) lock();
    else setSessionControl("ready");
  }
  async function runSettingAction(work: () => Promise<unknown>, options: ActionToastOptions) {
    return (await runAction(work, options)).ok;
  }
  const [
    {
      isCategoryDialogOpen,
      newCategoryName,
      newCategoryParentId,
      newCategoryColor,
      newCategoryIcon,
      editingCategoryIconId,
    },
    {
      isCategoryDialogOpen: setIsCategoryDialogOpen,
      newCategoryName: setNewCategoryName,
      newCategoryParentId: setNewCategoryParentId,
      newCategoryColor: setNewCategoryColor,
      newCategoryIcon: setNewCategoryIcon,
      editingCategoryIconId: setEditingCategoryIconId,
    },
  ] = useDraftFields(() => ({
    isCategoryDialogOpen: false,
    newCategoryName: "",
    newCategoryParentId: "",
    newCategoryColor: "#2563EB",
    newCategoryIcon: "tag",
    editingCategoryIconId: null as string | null,
  }));

  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [{ newTagName, newTagColor }, { newTagName: setNewTagName, newTagColor: setNewTagColor }] =
    useDraftFields(() => ({ newTagName: "", newTagColor: "#2563EB" }));

  const [tagDrafts, setTagDrafts] = useState<Record<string, TagDraft>>({});
  const [
    { newBudgetName, newBudgetLimit, newBudgetCategoryId },
    {
      newBudgetName: setNewBudgetName,
      newBudgetLimit: setNewBudgetLimit,
      newBudgetCategoryId: setNewBudgetCategoryId,
    },
  ] = useDraftFields(() => ({ newBudgetName: "", newBudgetLimit: "", newBudgetCategoryId: "" }));

  const [defaultsDraft, setDefaultsDraft] = useState<
    Partial<{
      defaultAccountId: string;
      defaultPaymentMethod: string;
      defaultPaymentStatus: typeof dataset.settings.defaultPaymentStatus;
      primaryCurrency: CurrencyCode;
    }>
  >({});
  const defaultAccountId =
    defaultsDraft.defaultAccountId ??
    dataset.settings.defaultAccountId ??
    dataset.settings.primaryAccountId ??
    "";
  const defaultPaymentMethod =
    defaultsDraft.defaultPaymentMethod ??
    (dataset.settings.defaultCreditCardId
      ? `card:${dataset.settings.defaultCreditCardId}`
      : dataset.settings.defaultPaymentType);
  const defaultPaymentStatus =
    defaultsDraft.defaultPaymentStatus ?? dataset.settings.defaultPaymentStatus;
  const primaryCurrency = defaultsDraft.primaryCurrency ?? dataset.settings.primaryCurrency;
  const setDefaultAccountId = (value: string) =>
    setDefaultsDraft((current) => ({ ...current, defaultAccountId: value }));
  const setDefaultPaymentMethod = (value: string) =>
    setDefaultsDraft((current) => ({ ...current, defaultPaymentMethod: value }));
  const setDefaultPaymentStatus = (value: typeof defaultPaymentStatus) =>
    setDefaultsDraft((current) => ({ ...current, defaultPaymentStatus: value }));
  const setPrimaryCurrency = (value: CurrencyCode) =>
    setDefaultsDraft((current) => ({ ...current, primaryCurrency: value }));

  function openRecords(filters: Parameters<typeof setRecordFilters>[0]) {
    setRecordFilters(filters);
    void navigate("/records");
  }

  async function handleAddBudget(event: FormEvent) {
    event.preventDefault();
    const limitAmount = Number(newBudgetLimit);
    if (!newBudgetName.trim() || !Number.isFinite(limitAmount) || limitAmount <= 0) return;
    if (
      !(await runSettingAction(
        () =>
          addBudget({
            name: newBudgetName.trim(),
            limitAmount,
            currency: primaryCurrency,
            period: "monthly",
            categoryId: newBudgetCategoryId || undefined,
            color: "#F59E0B",
            isActive: true,
          }),
        {
          singleFlight: "budget-create",
          processing: "Creating budget...",
          success: "Budget created",
          error: "Could not create budget",
        },
      ))
    )
      return;
    setNewBudgetName("");
    setNewBudgetLimit("");
    setNewBudgetCategoryId("");
  }

  async function saveRecordDefaults() {
    const saved = await runSettingAction(
      () =>
        updateWalletSettings({
          primaryCurrency,
          defaultAccountId: defaultAccountId || null,
          ...paymentDefaults(defaultPaymentMethod),
          defaultPaymentStatus,
        }),
      {
        singleFlight: "defaults",
        processing: "Saving defaults...",
        success: "Defaults saved",
        error: "Could not save defaults",
      },
    );
    if (saved) setDefaultsDraft({});
  }

  function getCategoryDraft(category: Category): CategoryDraft {
    return (
      categoryDrafts[category.id] ?? {
        name: category.name,
        parentId: category.parentId,
        color: category.color,
        icon: category.icon,
      }
    );
  }

  function updateCategoryDraft(categoryId: string, patch: Partial<CategoryDraft>) {
    const currentCategory = dataset.categories.find((category) => category.id === categoryId);
    if (!currentCategory) return;

    setCategoryDrafts((current) => {
      const currentDraft =
        current[categoryId] ??
        ({
          name: currentCategory.name,
          parentId: currentCategory.parentId,
          color: currentCategory.color,
          icon: currentCategory.icon,
        } satisfies CategoryDraft);
      const nextDraft = {
        ...currentDraft,
        ...patch,
      };

      return {
        ...current,
        [categoryId]: nextDraft,
      };
    });
  }

  function clearCategoryDraft(categoryId: string) {
    setCategoryDrafts((current) => {
      const next = { ...current };
      delete next[categoryId];
      return next;
    });
  }

  function toggleCategoryExpansion(categoryId: string) {
    setExpandedCategoryIds((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }

  async function handleAddCategory(event: FormEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    if (
      !(await runSettingAction(
        () =>
          addCategory({
            name,
            parentId: newCategoryParentId || undefined,
            color: newCategoryColor,
            icon: newCategoryIcon.trim() || "tag",
          }),
        {
          singleFlight: "category-create",
          processing: "Creating category...",
          success: "Category created",
          error: "Could not create category",
        },
      ))
    )
      return;
    setNewCategoryName("");
    setNewCategoryParentId("");
    setNewCategoryColor("#2563EB");
    setNewCategoryIcon("tag");
    setIsCategoryDialogOpen(false);
  }

  async function handleSaveCategory(category: Category) {
    const draft = getCategoryDraft(category);
    const name = draft.name.trim();
    if (!name) return;

    if (
      !(await runSettingAction(
        () =>
          updateCategory(category.id, {
            ...draft,
            name,
          }),
        {
          singleFlight: `category-save:${category.id}`,
          processing: "Saving category...",
          success: "Category saved",
          error: "Could not save category",
        },
      ))
    )
      return;
    clearCategoryDraft(category.id);
  }

  async function handleDeleteCategory(categoryId: string) {
    if (
      !(await confirm({
        title: "Eliminate category tree?",
        description: "Delete this category tree and reassign its history to Category eliminated?",
        confirmLabel: "Eliminate category",
      }))
    )
      return;
    if (
      !(await runSettingAction(() => deleteCategory(categoryId), {
        singleFlight: `category-delete:${categoryId}`,
        processing: "Reassigning category history...",
        success: "Category eliminated and history reassigned",
        error: "Could not eliminate category",
      }))
    )
      return;
    clearCategoryDraft(categoryId);
  }

  function getTagDraft(tag: Tag): TagDraft {
    return (
      tagDrafts[tag.id] ?? {
        name: tag.name,
        color: tag.color,
        isActive: tag.isActive,
      }
    );
  }

  function updateTagDraft(tagId: string, patch: Partial<TagDraft>) {
    const currentTag = dataset.tags.find((tag) => tag.id === tagId);
    if (!currentTag) return;

    setTagDrafts((current) => {
      const currentDraft =
        current[tagId] ??
        ({
          name: currentTag.name,
          color: currentTag.color,
          isActive: currentTag.isActive,
        } satisfies TagDraft);

      return {
        ...current,
        [tagId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  }

  function clearTagDraft(tagId: string) {
    setTagDrafts((current) => {
      const next = { ...current };
      delete next[tagId];
      return next;
    });
  }

  async function handleAddTag(event: FormEvent) {
    event.preventDefault();
    const name = newTagName.trim();
    if (!name) return;

    if (
      !(await runSettingAction(
        () =>
          addTag({
            name,
            color: newTagColor,
            isActive: true,
          }),
        {
          singleFlight: "tag-create",
          processing: "Creating tag...",
          success: "Tag created",
          error: "Could not create tag",
        },
      ))
    )
      return;
    setNewTagName("");
    setNewTagColor("#2563EB");
  }

  async function handleSaveTag(tag: Tag) {
    const draft = getTagDraft(tag);
    const name = draft.name.trim();
    if (!name) return;

    if (
      !(await runSettingAction(
        () =>
          updateTag(tag.id, {
            ...draft,
            name,
          }),
        {
          singleFlight: `tag-save:${tag.id}`,
          processing: "Saving tag...",
          success: "Tag saved",
          error: "Could not save tag",
        },
      ))
    )
      return;
    clearTagDraft(tag.id);
  }

  async function handleDeleteTag(tagId: string) {
    if (
      !(await runSettingAction(() => deleteTag(tagId), {
        singleFlight: `tag-delete:${tagId}`,
        processing: "Deleting tag...",
        success: "Tag deleted",
        error: "Could not delete tag",
      }))
    )
      return;
    clearTagDraft(tagId);
  }

  function renderCategoryIconGrid({
    selectedIcon,
    color,
    onSelect,
  }: {
    selectedIcon: string;
    color: string;
    onSelect: (icon: string) => void;
  }) {
    return (
      <div className="grid max-h-44 grid-cols-7 gap-2 overflow-y-auto rounded-md border p-2">
        {categoryIconOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition hover:border-primary ${
              selectedIcon === option.value ? "border-primary bg-secondary" : "border-transparent"
            }`}
            title={option.label}
            aria-label={`Use ${option.label} icon`}
            onClick={() => onSelect(option.value)}
          >
            <CategoryIcon icon={option.value} color={color} size="sm" />
          </button>
        ))}
      </div>
    );
  }

  function renderCategoryEditor(category: Category, level = 0) {
    const draft = getCategoryDraft(category);
    const children = childCategories(dataset.categories, category.id);
    const hasChildren = children.length > 0;
    const isExpanded = Boolean(expandedCategoryIds[category.id]);
    const isDirty =
      draft.name !== category.name ||
      draft.color !== category.color ||
      draft.icon !== category.icon;

    return (
      <div key={category.id} className={level > 0 ? "ml-4 border-l pl-4" : ""}>
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          {hasChildren && level === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                isExpanded
                  ? `Hide children for ${category.name}`
                  : `Show children for ${category.name}`
              }
              title={isExpanded ? "Hide children" : "Show children"}
              onClick={() => toggleCategoryExpansion(category.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <span className="hidden h-10 w-10 md:block" aria-hidden="true" />
          )}
          <button
            type="button"
            className="rounded-full outline-none ring-offset-background transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`Change icon for ${category.name}`}
            title="Change icon"
            onClick={() => setEditingCategoryIconId(category.id)}
          >
            <CategoryIcon icon={draft.icon} color={draft.color} />
          </button>
          <ColorInput
            value={draft.color}
            onChange={(event) => updateCategoryDraft(category.id, { color: event.target.value })}
            className={colorInputClassName}
            aria-label={`${category.name} color`}
          />
          <Input
            value={draft.name}
            onChange={(event) => updateCategoryDraft(category.id, { name: event.target.value })}
            className={`${inlineFieldClassName} min-w-40 flex-1`}
            placeholder="Name"
          />
          <Button
            type="button"
            size="icon"
            aria-label={`Save ${category.name}`}
            title="Save"
            disabled={!isDirty}
            onClick={() => {
              finishAction(handleSaveCategory(category));
            }}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            disabled={Boolean(category.systemKey)}
            aria-label={`Delete ${category.name}`}
            title={
              category.systemKey
                ? "System category"
                : hasChildren
                  ? "Delete category and children"
                  : "Delete"
            }
            onClick={() => {
              finishAction(handleDeleteCategory(category.id));
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {hasChildren && level === 0 && isExpanded ? (
          <div className="mt-2 space-y-2">
            {children.map((child) => renderCategoryEditor(child, level + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  const editingCategoryIcon = editingCategoryIconId
    ? dataset.categories.find((category) => category.id === editingCategoryIconId)
    : undefined;
  const editingCategoryIconDraft = editingCategoryIcon
    ? getCategoryDraft(editingCategoryIcon)
    : undefined;

  return (
    <div>
      <ActionToast toast={toast} />
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="General preferences, security, categories, tags, and administration shortcuts."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <label className="space-y-2">
              <span className="text-sm font-medium">Account</span>
              <select
                className={fieldClassName}
                value={defaultAccountId}
                onChange={(event) => setDefaultAccountId(event.target.value)}
              >
                {dataset.accounts
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Payment method</span>
              <select
                className={fieldClassName}
                value={defaultPaymentMethod}
                onChange={(event) => setDefaultPaymentMethod(event.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="debit">Debit</option>
                {dataset.creditCards
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={`card:${item.id}`}>
                      Credit •••• {item.lastFour} — {item.name}
                    </option>
                  ))}
                <option value="transfer">Transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Status</span>
              <select
                className={fieldClassName}
                value={defaultPaymentStatus}
                onChange={(event) =>
                  setDefaultPaymentStatus(event.target.value as typeof defaultPaymentStatus)
                }
              >
                <option value="cleared">Cleared</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Primary currency</span>
              <select
                className={fieldClassName}
                value={primaryCurrency}
                onChange={(event) => setPrimaryCurrency(event.target.value as CurrencyCode)}
              >
                {currencySchema.options.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <Button className="self-end" onClick={() => void saveRecordDefaults()}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Follow your saved preference on every device
                </p>
              </div>
              <select
                aria-label="Theme"
                value={dataset.settings.theme}
                className="rounded-md border bg-background p-2"
                onChange={(event) =>
                  void runSettingAction(
                    () =>
                      updateWalletSettings({
                        theme: event.target.value as typeof dataset.settings.theme,
                      }),
                    {
                      processing: "Saving theme...",
                      success: "Theme saved",
                      error: "Could not save theme",
                    },
                  )
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Session</p>
                <p className="text-sm text-muted-foreground">
                  Locking clears the session and private cache in this browser.
                </p>
              </div>
              <div className="flex gap-2">
                {sessionControl !== "disabled" ? (
                  <Button
                    variant="outline"
                    disabled={sessionControl === "busy"}
                    onClick={() => finishAction(closeAllSessions())}
                  >
                    Lock all sessions
                  </Button>
                ) : null}
                <Button variant="outline" onClick={lock}>
                  Lock
                </Button>
              </div>
            </div>
            {expiresAt && (
              <p className="text-sm text-muted-foreground">
                Session expires: {new Date(expiresAt).toLocaleString("es-UY")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="h-4 w-4" />
                Categories
              </CardTitle>
              <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" aria-label="New category">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New category</DialogTitle>
                    <DialogDescription>
                      Create a parent category or select a parent to create a child.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      finishAction(handleAddCategory(event));
                    }}
                  >
                    <fieldset disabled={toast?.status === "processing"} className="contents">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Name</span>
                        <Input
                          value={newCategoryName}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                          className={fieldClassName}
                          placeholder="Groceries, Butcher, Rent..."
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Parent</span>
                        <select
                          value={newCategoryParentId}
                          onChange={(event) => setNewCategoryParentId(event.target.value)}
                          className={fieldClassName}
                        >
                          <option value="">No parent</option>
                          {dataset.categories
                            .filter((category) => !category.parentId)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Color</span>
                          <div className="flex items-center gap-2">
                            <CategoryIcon icon={newCategoryIcon} color={newCategoryColor} />
                            <ColorInput
                              value={newCategoryColor}
                              onChange={(event) => setNewCategoryColor(event.target.value)}
                              className={colorInputClassName}
                              aria-label="New category color"
                            />
                          </div>
                        </label>
                        <div className="space-y-2">
                          <span className="text-sm font-medium">Icon</span>
                          {renderCategoryIconGrid({
                            selectedIcon: newCategoryIcon,
                            color: newCategoryColor,
                            onSelect: setNewCategoryIcon,
                          })}
                        </div>
                      </div>
                      <Button className="w-full" type="submit">
                        <Plus className="h-4 w-4" />
                        Add category
                      </Button>
                    </fieldset>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-3">
                {dataset.categories
                  .filter((category) => !category.parentId)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((category) => renderCategoryEditor(category))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(editingCategoryIcon)}
          onOpenChange={(open) => {
            if (!open) setEditingCategoryIconId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Icon for {editingCategoryIcon?.name ?? "category"}</DialogTitle>
              <DialogDescription>
                Choose an icon to combine with the current category color.
              </DialogDescription>
            </DialogHeader>
            {editingCategoryIcon && editingCategoryIconDraft ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <CategoryIcon
                    icon={editingCategoryIconDraft.icon}
                    color={editingCategoryIconDraft.color}
                    size="lg"
                  />
                  <div>
                    <p className="font-medium">{editingCategoryIcon.name}</p>
                    <p className="text-sm text-muted-foreground">
                      After choosing, use Save in the row to confirm.
                    </p>
                  </div>
                </div>
                {renderCategoryIconGrid({
                  selectedIcon: editingCategoryIconDraft.icon,
                  color: editingCategoryIconDraft.color,
                  onSelect: (icon) => {
                    updateCategoryDraft(editingCategoryIcon.id, { icon });
                    setEditingCategoryIconId(null);
                  },
                })}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <form
                className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
                onSubmit={(event) => {
                  finishAction(handleAddTag(event));
                }}
              >
                <fieldset disabled={toast?.status === "processing"} className="contents">
                  <Input
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    className={fieldClassName}
                    placeholder="New tag"
                  />
                  <ColorInput
                    value={newTagColor}
                    onChange={(event) => setNewTagColor(event.target.value)}
                    className={colorInputClassName}
                    aria-label="New tag color"
                  />
                  <Button type="submit">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </fieldset>
              </form>

              <div className="space-y-2">
                {dataset.tags.map((tag) => {
                  const draft = getTagDraft(tag);
                  const isDirty =
                    draft.name !== tag.name ||
                    draft.color !== tag.color ||
                    draft.isActive !== tag.isActive;

                  return (
                    <div
                      key={tag.id}
                      className="grid gap-2 rounded-md border p-3 md:grid-cols-[auto_1fr_120px_auto_auto_auto]"
                    >
                      <ColorInput
                        value={draft.color}
                        onChange={(event) => updateTagDraft(tag.id, { color: event.target.value })}
                        className={colorInputClassName}
                        aria-label={`${tag.name} color`}
                      />
                      <Input
                        value={draft.name}
                        onChange={(event) => updateTagDraft(tag.id, { name: event.target.value })}
                        className={fieldClassName}
                        placeholder="Name"
                      />
                      <select
                        value={draft.isActive ? "active" : "inactive"}
                        onChange={(event) =>
                          updateTagDraft(tag.id, {
                            isActive: event.target.value === "active",
                          })
                        }
                        className={fieldClassName}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`View records for ${tag.name}`}
                        title="View records"
                        onClick={() => openRecords({ tagId: tag.id, type: "all" })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        aria-label={`Save ${tag.name}`}
                        title="Save"
                        disabled={!isDirty}
                        onClick={() => {
                          finishAction(handleSaveTag(tag));
                        }}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        aria-label={`Delete ${tag.name}`}
                        title="Delete"
                        onClick={() => {
                          finishAction(handleDeleteTag(tag.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Budgets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid gap-2 md:grid-cols-[1fr_140px_1fr_auto]"
              onSubmit={(event) => {
                finishAction(handleAddBudget(event));
              }}
            >
              <fieldset disabled={toast?.status === "processing"} className="contents">
                <Input
                  value={newBudgetName}
                  onChange={(event) => setNewBudgetName(event.target.value)}
                  className={fieldClassName}
                  placeholder="Monthly budget"
                />
                <Input
                  value={newBudgetLimit}
                  onChange={(event) => setNewBudgetLimit(event.target.value)}
                  className={fieldClassName}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Limit"
                />
                <CategoryCombobox
                  label="Budget category"
                  categories={dataset.categories}
                  value={newBudgetCategoryId}
                  onChange={setNewBudgetCategoryId}
                  allowEmpty
                  emptyLabel="All categories"
                />
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </fieldset>
            </form>
            <div className="space-y-2">
              {dataset.budgets.map((budget) => (
                <div
                  key={budget.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{budget.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {budget.limitAmount} {budget.currency} ·{" "}
                      {budget.isActive ? "Active" : "Paused"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        void runSettingAction(
                          () =>
                            updateBudget(budget.id, {
                              ...budget,
                              isActive: !budget.isActive,
                            }),
                          {
                            processing: "Updating budget...",
                            success: "Budget updated",
                            error: "Could not update budget",
                          },
                        ).catch(() => undefined)
                      }
                    >
                      {budget.isActive ? "Pause" : "Activate"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      aria-label={`Delete ${budget.name}`}
                      onClick={() =>
                        void runSettingAction(() => deleteBudget(budget.id), {
                          processing: "Deleting budget...",
                          success: "Budget deleted",
                          error: "Could not delete budget",
                        }).catch(() => undefined)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Administration
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => {
                void navigate("/accounts");
              }}
            >
              Accounts
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => {
                void navigate("/goals");
              }}
            >
              Goals
              <Target className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => {
                void navigate("/investments");
              }}
            >
              Investments
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => {
                void navigate("/data");
              }}
            >
              Data
              <Upload className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
      <RecordTemplateManager />
      <ConfirmDialog {...confirmationProps} />
    </div>
  );
}
