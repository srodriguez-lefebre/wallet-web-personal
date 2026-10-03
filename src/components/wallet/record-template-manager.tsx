import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import {
  prepareTemplateDraft,
  sameTemplateDetails,
  templateReplacementPatch,
} from "@/lib/record-templates";
import { useWallet } from "@/providers/wallet-provider";
import { recordTemplateSchema } from "@shared/schemas";
import { formatMoney } from "@shared/calculations";
import type {
  RecordTemplate,
  CurrencyCode,
  RecordType,
  PaymentType,
} from "@shared/types";

type Draft = Omit<RecordTemplate, "id" | "amount"> & { amount: string };
const field =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function RecordTemplateManager() {
  const {
    dataset,
    addRecordTemplate,
    updateRecordTemplate,
    deleteRecordTemplate,
    getCompleteDataset,
    requestNewRecord,
  } = useWallet();
  const navigate = useNavigate();
  const { toast, runAction } = useActionToast();
  const [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false),
    revision = useRef(0),
    saveUncertain = useRef(false),
    removeUncertain = useRef(new Set<string>());
  const [draft, setDraft] = useState<Draft>({
    name: "",
    type: "expense",
    amount: "",
    currency: dataset.settings.primaryCurrency,
    paymentType: "debit",
  });
  const templates = dataset.recordTemplates ?? [];
  function start(template?: RecordTemplate) {
    revision.current += 1;
    saveUncertain.current = false;
    setError("");
    setNotice("");
    setEditingId(template?.id ?? null);
    if (template) {
      const prepared = prepareTemplateDraft(template, dataset);
      setDraft({ ...prepared.value, amount: String(template.amount) });
      setNotice(prepared.problems.join(" "));
    } else {
      const account =
        dataset.accounts.find(
          (item) =>
            item.isActive &&
            item.isVisible &&
            item.id ===
              (dataset.settings.defaultAccountId ??
                dataset.settings.primaryAccountId),
        ) ?? dataset.accounts.find((item) => item.isActive && item.isVisible);
      setDraft({
        name: "",
        type: "expense",
        amount: "",
        currency: account?.currency ?? dataset.settings.primaryCurrency,
        accountId: account?.id,
        paymentType: "debit",
      });
    }
    setOpen(true);
  }
  function close() {
    revision.current += 1;
    setOpen(false);
    setError("");
    saveUncertain.current = false;
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = recordTemplateSchema.safeParse({
      ...draft,
      name: draft.name.trim(),
      amount: Number(draft.amount),
      accountId: draft.accountId || undefined,
      creditCardId:
        draft.type === "expense" ? draft.creditCardId || undefined : undefined,
      destinationAccountId:
        draft.type === "transfer"
          ? draft.destinationAccountId || undefined
          : undefined,
      categoryId:
        draft.type === "transfer" ? undefined : draft.categoryId || undefined,
      tagId: draft.tagId || undefined,
      counterpartyName: draft.counterpartyName?.trim() || undefined,
      note: draft.note?.trim() || undefined,
      paymentType: draft.type === "transfer" ? "transfer" : draft.paymentType,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Revisá los datos de la plantilla.",
      );
      return;
    }
    const payload = parsed.data,
      currentRevision = revision.current;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await runAction(
        async () => {
          if (saveUncertain.current) {
            const fresh = await getCompleteDataset();
            const found = fresh.recordTemplates?.find((item) =>
              editingId
                ? item.id === editingId
                : item.name.trim().toLowerCase() === payload.name.toLowerCase(),
            );
            if (found && sameTemplateDetails(found, payload)) return;
          }
          if (editingId)
            await updateRecordTemplate(
              editingId,
              templateReplacementPatch(payload),
            );
          else await addRecordTemplate(payload);
        },
        {
          processing: "Guardando plantilla…",
          success: "Plantilla guardada",
          error: "No se pudo guardar la plantilla",
        },
      );
      if (currentRevision === revision.current) close();
    } catch (reason) {
      if (currentRevision === revision.current) {
        saveUncertain.current = true;
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo guardar. Reintentá para comprobar el estado actual.",
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await runAction(
        async () => {
          if (removeUncertain.current.has(id)) {
            const fresh = await getCompleteDataset();
            if (!fresh.recordTemplates?.some((item) => item.id === id)) return;
          }
          await deleteRecordTemplate(id);
        },
        {
          processing: "Quitando plantilla…",
          success: "Plantilla eliminada",
          error: "No se pudo quitar la plantilla",
        },
      );
      removeUncertain.current.delete(id);
    } catch (reason) {
      removeUncertain.current.add(id);
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo quitar. Reintentá para comprobar el estado actual.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Card className="mt-6">
      <ActionToast toast={toast} />
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Gestión de plantillas</CardTitle>
          <Button disabled={busy} onClick={() => start()}>
            Crear plantilla
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Guardá datos habituales de un pago o ingreso. Usar una plantilla abre
          un borrador: el movimiento se registra cuando lo confirmás.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!open && error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay plantillas guardadas.
          </p>
        ) : (
          <ul className="divide-y">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium break-words">{template.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(template.amount, template.currency)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    aria-label={`Usar plantilla ${template.name}`}
                    onClick={() => {
                      requestNewRecord(template.id);
                      navigate("/records");
                    }}
                  >
                    Usar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    aria-label={`Editar plantilla ${template.name}`}
                    onClick={() => start(template)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Quitar plantilla ${template.name}`}
                    onClick={() => void remove(template.id)}
                  >
                    Quitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar plantilla" : "Crear plantilla"}
              </DialogTitle>
              <DialogDescription>
                Configuración reutilizable. Las fechas y conversiones se eligen
                al usarla.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="space-y-4">
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              )}
              <label className="block space-y-1 text-sm">
                Nombre de plantilla
                <input
                  aria-label="Nombre de plantilla"
                  className={field}
                  value={draft.name}
                  maxLength={80}
                  onChange={(event) => change("name", event.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  Tipo
                  <select
                    aria-label="Tipo de plantilla"
                    className={field}
                    value={draft.type}
                    onChange={(event) => {
                      const type = event.target.value as RecordType;
                      setDraft((current) => ({
                        ...current,
                        type,
                        creditCardId: undefined,
                        paymentType: type === "transfer" ? "transfer" : "debit",
                      }));
                    }}
                  >
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Moneda
                  <select
                    aria-label="Moneda de plantilla"
                    className={field}
                    value={draft.currency}
                    onChange={(event) =>
                      change("currency", event.target.value as CurrencyCode)
                    }
                  >
                    {["UYU", "USD", "EUR", "BRL", "ARS"].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Importe
                  <input
                    aria-label="Importe de plantilla"
                    className={field}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.amount}
                    onChange={(event) => change("amount", event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  Cuenta
                  <select
                    aria-label="Cuenta de plantilla"
                    className={field}
                    value={draft.accountId ?? ""}
                    onChange={(event) =>
                      change("accountId", event.target.value)
                    }
                  >
                    <option value="">Elegir al usarla</option>
                    {dataset.accounts
                      .filter(
                        (account) => account.isActive && account.isVisible,
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </label>
                {draft.type === "transfer" ? (
                  <label className="space-y-1 text-sm">
                    Cuenta destino
                    <select
                      aria-label="Cuenta destino de plantilla"
                      className={field}
                      value={draft.destinationAccountId ?? ""}
                      onChange={(event) =>
                        change("destinationAccountId", event.target.value)
                      }
                    >
                      <option value="">Elegir al usarla</option>
                      {dataset.accounts
                        .filter(
                          (account) =>
                            account.isActive &&
                            account.isVisible &&
                            account.id !== draft.accountId,
                        )
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <label className="space-y-1 text-sm">
                    Categoría
                    <select
                      aria-label="Categoría de plantilla"
                      className={field}
                      value={draft.categoryId ?? ""}
                      onChange={(event) =>
                        change("categoryId", event.target.value)
                      }
                    >
                      <option value="">Elegir al usarla</option>
                      {dataset.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="space-y-1 text-sm">
                  Medio de pago
                  <select
                    aria-label="Medio de pago de plantilla"
                    className={field}
                    value={
                      draft.creditCardId
                        ? `card:${draft.creditCardId}`
                        : draft.paymentType
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        creditCardId: value.startsWith("card:")
                          ? value.slice(5)
                          : undefined,
                        paymentType: value.startsWith("card:")
                          ? "credit"
                          : (value as PaymentType),
                      }));
                    }}
                  >
                    <option value="cash">Efectivo</option>
                    <option value="debit">Débito</option>
                    {draft.type === "expense" &&
                      dataset.creditCards
                        .filter((card) => card.isActive)
                        .map((card) => (
                          <option key={card.id} value={`card:${card.id}`}>
                            {card.name} **** {card.lastFour}
                          </option>
                        ))}
                    <option value="transfer">Transferencia</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Etiqueta
                  <select
                    aria-label="Etiqueta de plantilla"
                    className={field}
                    value={draft.tagId ?? ""}
                    onChange={(event) => change("tagId", event.target.value)}
                  >
                    <option value="">Sin etiqueta</option>
                    {dataset.tags
                      .filter((tag) => tag.isActive)
                      .map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Contraparte
                  <input
                    aria-label="Contraparte de plantilla"
                    className={field}
                    value={draft.counterpartyName ?? ""}
                    onChange={(event) =>
                      change("counterpartyName", event.target.value)
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                Nota
                <textarea
                  aria-label="Nota de plantilla"
                  className={field + " min-h-20"}
                  value={draft.note ?? ""}
                  onChange={(event) => change("note", event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !draft.name.trim() ||
                    !(Number(draft.amount) > 0) ||
                    !Number.isFinite(Number(draft.amount))
                  }
                >
                  {busy ? "Guardando…" : "Guardar plantilla"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
