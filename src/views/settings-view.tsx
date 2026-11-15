import { currencySchema } from "@shared/schemas";
import {
  ArrowRight,
  Banknote,
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
import type { CurrencyCode, Tag } from "@shared/types";

import { CategoryCombobox } from "@/components/ui/form/category-combobox";
import {
  controlClassName as fieldClassName,
  colorControlClassName as colorInputClassName,
  ColorInput,
  Input,
} from "@/components/ui/form/controls";
import { useDraftFields } from "@/hooks/use-draft-fields";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordTemplateManager } from "@/components/wallet/record-template-manager";
import { finishAction } from "@/lib/async-event";
import { paymentDefaults } from "@/lib/preferences";
import { useActionToast } from "@/lib/use-action-toast";
import { useAuth } from "@/providers/auth-provider";
import { useWallet } from "@/providers/wallet-provider";

type TagDraft = Omit<Tag, "id">;
export function SettingsView() {
  const navigate = useNavigate();
  const {
    dataset,
    setRecordFilters,
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

  const recentCategories = dataset.categories
    .filter((category) => category.createdAt)
    .sort(
      (a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.name.localeCompare(b.name),
    )
    .slice(0, 3);

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
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dataset.categories.length} active categories
            </p>
            {recentCategories.length > 0 && (
              <p className="text-sm">
                Recently added · {recentCategories.map(({ name }) => name).join(", ")}
              </p>
            )}
            <Button variant="outline" onClick={() => void navigate("/settings/categories")}>
              Manage categories <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

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
                  kind="expense"
                  enableCreation
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
    </div>
  );
}
