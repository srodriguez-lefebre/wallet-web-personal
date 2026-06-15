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
import type { Tag } from "@shared/types";

type TagDraft = Omit<Tag, "id">;

export function SettingsView() {
  const navigate = useNavigate();
  const { dataset, setRecordFilters, addTag, updateTag, deleteTag } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { lock } = useAuth();
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Categorias
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {dataset.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  openRecords({
                    type: category.type === "income" ? "income" : "expense",
                    categoryId: category.id,
                  })
                }
                className="flex items-center gap-3 rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground">{category.type}</p>
                </div>
              </button>
            ))}
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
