import { FormEvent, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Eye,
  Lock,
  Moon,
  Palette,
  Plus,
  Save,
  Tags,
  Target,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { useWallet } from "@/providers/wallet-provider";
import type { Category, CategoryType, Tag } from "@shared/types";

type TagDraft = Omit<Tag, "id">;
type CategoryDraft = Omit<Category, "id">;

function childCategories(categories: Category[], parentId: string) {
  return categories
    .filter((category) => category.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function parentCategoryOptions(
  categories: Category[],
  categoryId: string | undefined,
  type: CategoryType,
) {
  return categories
    .filter(
      (category) =>
        !category.parentId && category.id !== categoryId && category.type === type,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

function defaultCategoryIcon(type: CategoryType, parentId?: string) {
  if (parentId) return "folder";
  return type === "income" ? "coins" : "tag";
}

export function SettingsView() {
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
  } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { lock } = useAuth();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>("expense");
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#2563EB");
  const [categoryDrafts, setCategoryDrafts] = useState<
    Record<string, CategoryDraft>
  >({});
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#2563EB");
  const [tagDrafts, setTagDrafts] = useState<Record<string, TagDraft>>({});
  const fieldClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const colorInputClassName =
    "h-10 w-10 cursor-pointer rounded-full border bg-background p-1 [appearance:none] [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0";

  function openRecords(filters: Parameters<typeof setRecordFilters>[0]) {
    setRecordFilters(filters);
    navigate("/records");
  }

  function getCategoryDraft(category: Category): CategoryDraft {
    return (
      categoryDrafts[category.id] ?? {
        name: category.name,
        type: category.type,
        parentId: category.parentId,
        color: category.color,
        icon: category.icon,
        isActive: category.isActive,
      }
    );
  }

  function updateCategoryDraft(
    categoryId: string,
    patch: Partial<CategoryDraft>,
  ) {
    const currentCategory = dataset.categories.find(
      (category) => category.id === categoryId,
    );
    if (!currentCategory) return;

    setCategoryDrafts((current) => {
      const currentDraft =
        current[categoryId] ??
        ({
          name: currentCategory.name,
          type: currentCategory.type,
          parentId: currentCategory.parentId,
          color: currentCategory.color,
          icon: currentCategory.icon,
          isActive: currentCategory.isActive,
        } satisfies CategoryDraft);
      const nextDraft = {
        ...currentDraft,
        ...patch,
      };

      if (patch.type && patch.type !== currentDraft.type) {
        nextDraft.parentId = undefined;
      }

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

  function handleAddCategory(event: FormEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    addCategory({
      name,
      type: newCategoryType,
      parentId: newCategoryParentId || undefined,
      color: newCategoryColor,
      icon: defaultCategoryIcon(newCategoryType, newCategoryParentId),
      isActive: true,
    });
    setNewCategoryName("");
    setNewCategoryParentId("");
    setNewCategoryColor("#2563EB");
  }

  function handleSaveCategory(category: Category) {
    const draft = getCategoryDraft(category);
    const name = draft.name.trim();
    if (!name) return;

    updateCategory(category.id, {
      ...draft,
      name,
      parentId: draft.parentId || undefined,
    });
    clearCategoryDraft(category.id);
  }

  function handleDeleteCategory(categoryId: string) {
    deleteCategory(categoryId);
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

  function handleAddTag(event: FormEvent) {
    event.preventDefault();
    const name = newTagName.trim();
    if (!name) return;

    addTag({
      name,
      color: newTagColor,
      isActive: true,
    });
    setNewTagName("");
    setNewTagColor("#2563EB");
  }

  function handleSaveTag(tag: Tag) {
    const draft = getTagDraft(tag);
    const name = draft.name.trim();
    if (!name) return;

    updateTag(tag.id, {
      ...draft,
      name,
    });
    clearTagDraft(tag.id);
  }

  function handleDeleteTag(tagId: string) {
    deleteTag(tagId);
    clearTagDraft(tagId);
  }

  function renderCategoryEditor(category: Category, level = 0) {
    const draft = getCategoryDraft(category);
    const children = childCategories(dataset.categories, category.id);
    const hasChildren = children.length > 0;
    const parentOptions = parentCategoryOptions(
      dataset.categories,
      category.id,
      draft.type,
    );
    const isDirty =
      draft.name !== category.name ||
      draft.type !== category.type ||
      (draft.parentId ?? "") !== (category.parentId ?? "") ||
      draft.color !== category.color ||
      draft.icon !== category.icon ||
      draft.isActive !== category.isActive;

    return (
      <div key={category.id} className={level > 0 ? "ml-4 border-l pl-4" : ""}>
        <div className="grid gap-2 rounded-md border p-3 lg:grid-cols-[auto_1fr_110px_170px_110px_110px_auto_auto_auto]">
          <input
            value={draft.color}
            onChange={(event) =>
              updateCategoryDraft(category.id, { color: event.target.value })
            }
            type="color"
            className={colorInputClassName}
            aria-label={`Color de ${category.name}`}
          />
          <input
            value={draft.name}
            onChange={(event) =>
              updateCategoryDraft(category.id, { name: event.target.value })
            }
            className={fieldClassName}
            placeholder="Name"
          />
          <select
            value={draft.type}
            onChange={(event) =>
              updateCategoryDraft(category.id, {
                type: event.target.value as CategoryType,
              })
            }
            className={fieldClassName}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select
            value={draft.parentId ?? ""}
            onChange={(event) =>
              updateCategoryDraft(category.id, {
                parentId: event.target.value || undefined,
              })
            }
            className={fieldClassName}
            disabled={hasChildren}
            title={
              hasChildren
                ? "Una categoria con hijas debe quedar como padre"
                : "Categoria padre"
            }
          >
            <option value="">No parent</option>
            {parentOptions.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
          <input
            value={draft.icon}
            onChange={(event) =>
              updateCategoryDraft(category.id, { icon: event.target.value })
            }
            className={fieldClassName}
            placeholder="Icon"
          />
          <select
            value={draft.isActive ? "active" : "inactive"}
            onChange={(event) =>
              updateCategoryDraft(category.id, {
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
            aria-label={`Ver registros de ${category.name}`}
            title="Ver registros"
            onClick={() =>
              openRecords({
                type: category.type === "income" ? "income" : "expense",
                categoryId: category.id,
              })
            }
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            aria-label={`Guardar ${category.name}`}
            title="Guardar"
            disabled={!isDirty}
            onClick={() => handleSaveCategory(category)}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            aria-label={`Eliminar ${category.name}`}
            title={hasChildren ? "Eliminar categoria e hijas" : "Eliminar"}
            onClick={() => handleDeleteCategory(category.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {children.length > 0 ? (
          <div className="mt-2 space-y-2">
            {children.map((child) => renderCategoryEditor(child, level + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Configuracion"
        description="Preferencias generales, seguridad, categorias, etiquetas y accesos de administracion."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Preferencias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Moneda principal</p>
                <p className="text-sm text-muted-foreground">Para dashboard y reportes</p>
              </div>
              <Badge>{dataset.settings.primaryCurrency}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Tema</p>
                <p className="text-sm text-muted-foreground">Claro principal, oscuro alternativo</p>
              </div>
              <Button variant="outline" onClick={toggleTheme}>
                <Moon className="h-4 w-4" />
                {theme}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Token local</p>
                <p className="text-sm text-muted-foreground">
                  Bloquear borra el token guardado en este navegador.
                </p>
              </div>
              <Button variant="outline" onClick={lock}>
                Bloquear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <form
                className="grid gap-2 lg:grid-cols-[1fr_120px_170px_auto_auto]"
                onSubmit={handleAddCategory}
              >
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  className={fieldClassName}
                  placeholder="New category"
                />
                <select
                  value={newCategoryType}
                  onChange={(event) => {
                    setNewCategoryType(event.target.value as CategoryType);
                    setNewCategoryParentId("");
                  }}
                  className={fieldClassName}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
                <select
                  value={newCategoryParentId}
                  onChange={(event) => setNewCategoryParentId(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">No parent</option>
                  {parentCategoryOptions(
                    dataset.categories,
                    undefined,
                    newCategoryType,
                  ).map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newCategoryColor}
                  onChange={(event) => setNewCategoryColor(event.target.value)}
                  type="color"
                  className={colorInputClassName}
                  aria-label="Color de categoria nueva"
                />
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </form>

              <div className="space-y-3">
                {dataset.categories
                  .filter((category) => !category.parentId)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((category) => renderCategoryEditor(category))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Etiquetas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <form
                className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
                onSubmit={handleAddTag}
              >
                <input
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  className={fieldClassName}
                  placeholder="Nueva etiqueta"
                />
                <input
                  value={newTagColor}
                  onChange={(event) => setNewTagColor(event.target.value)}
                  type="color"
                  className={colorInputClassName}
                  aria-label="Color de etiqueta nueva"
                />
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
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
                      <input
                        value={draft.color}
                        onChange={(event) =>
                          updateTagDraft(tag.id, { color: event.target.value })
                        }
                        type="color"
                        className={colorInputClassName}
                        aria-label={`Color de ${tag.name}`}
                      />
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          updateTagDraft(tag.id, { name: event.target.value })
                        }
                        className={fieldClassName}
                        placeholder="Nombre"
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
                        <option value="active">Activa</option>
                        <option value="inactive">Inactiva</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Ver registros de ${tag.name}`}
                        title="Ver registros"
                        onClick={() => openRecords({ tagId: tag.id, type: "all" })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        aria-label={`Guardar ${tag.name}`}
                        title="Guardar"
                        disabled={!isDirty}
                        onClick={() => handleSaveTag(tag)}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        aria-label={`Eliminar ${tag.name}`}
                        title="Eliminar"
                        onClick={() => handleDeleteTag(tag.id)}
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
              <Banknote className="h-4 w-4" />
              Administracion
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/accounts")}
            >
              Cuentas
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/goals")}
            >
              Objetivos
              <Target className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/investments")}
            >
              Inversiones
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/imports")}
            >
              Imports
              <Upload className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
