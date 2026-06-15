import { FormEvent, useState } from "react";
import {
  Banknote,
  Edit3,
  Eye,
  EyeOff,
  Landmark,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney } from "@shared/calculations";
import type { CurrencyCode, Investment } from "@shared/types";

interface InvestmentDraft {
  id: string;
  name: string;
  type: Investment["type"];
  amountInvested: string;
  currentValue: string;
  currency: CurrencyCode;
  startedAt: string;
  isVisible: boolean;
  note: string;
  isDeleted: boolean;
}

const investmentTypeOptions: Array<{ value: Investment["type"]; label: string }> = [
  { value: "fund", label: "Fondo" },
  { value: "stock", label: "Accion" },
  { value: "crypto", label: "Crypto" },
  { value: "deposit", label: "Deposito" },
  { value: "other", label: "Otro" },
];

function buildInvestmentDrafts(investments: Investment[]): InvestmentDraft[] {
  return investments.map((investment) => ({
    id: investment.id,
    name: investment.name,
    type: investment.type,
    amountInvested: String(investment.amountInvested),
    currentValue: String(investment.currentValue),
    currency: investment.currency,
    startedAt: investment.startedAt,
    isVisible: investment.isVisible,
    note: investment.note ?? "",
    isDeleted: false,
  }));
}

export function InvestmentsView() {
  const navigate = useNavigate();
  const { dataset, addInvestment, updateInvestment, deleteInvestment } = useWallet();
  const [showHidden, setShowHidden] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [investmentDrafts, setInvestmentDrafts] = useState<InvestmentDraft[]>(() =>
    buildInvestmentDrafts(dataset.investments),
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<Investment["type"]>("fund");
  const [amountInvested, setAmountInvested] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [isVisible, setIsVisible] = useState(true);
  const [note, setNote] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const visibleInvestments = dataset.investments.filter(
    (investment) => investment.isVisible,
  );
  const hiddenInvestments = dataset.investments.filter(
    (investment) => !investment.isVisible,
  );
  const renderedInvestments = showHidden
    ? dataset.investments
    : visibleInvestments;
  const visibleInvestmentDrafts = investmentDrafts.filter(
    (draft) => !draft.isDeleted,
  );
  const inputClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const textareaClassName =
    "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  function startEditingInvestments() {
    setInvestmentDrafts(buildInvestmentDrafts(dataset.investments));
    setEditError("");
    setIsEditing(true);
  }

  function cancelEditingInvestments() {
    setInvestmentDrafts(buildInvestmentDrafts(dataset.investments));
    setEditError("");
    setIsEditing(false);
  }

  function updateInvestmentDraft(
    investmentIdToUpdate: string,
    patch: Partial<InvestmentDraft>,
  ) {
    setInvestmentDrafts((current) =>
      current.map((draft) =>
        draft.id === investmentIdToUpdate
          ? {
              ...draft,
              ...patch,
            }
          : draft,
      ),
    );
  }

  function markInvestmentForDeletion(investmentIdToDelete: string) {
    setInvestmentDrafts((current) =>
      current.map((draft) =>
        draft.id === investmentIdToDelete
          ? {
              ...draft,
              isDeleted: true,
            }
          : draft,
      ),
    );
  }

  function saveInvestmentEdits() {
    const activeDrafts = investmentDrafts.filter((draft) => !draft.isDeleted);
    const invalidDraft = activeDrafts.find(
      (draft) =>
        !draft.name.trim() ||
        Number(draft.amountInvested) <= 0 ||
        Number(draft.currentValue) <= 0,
    );

    if (invalidDraft) {
      setEditError("Revisa nombre, invertido y valor actual en cada inversion.");
      return;
    }

    investmentDrafts
      .filter((draft) => draft.isDeleted)
      .forEach((draft) => deleteInvestment(draft.id));

    activeDrafts.forEach((draft) => {
      updateInvestment(draft.id, {
        name: draft.name.trim(),
        type: draft.type,
        amountInvested: Number(draft.amountInvested),
        currentValue: Number(draft.currentValue),
        currency: draft.currency,
        startedAt: draft.startedAt,
        isVisible: draft.isVisible,
        note: draft.note.trim() || undefined,
      });
    });

    setEditError("");
    setIsEditing(false);
  }

  function handleCreateInvestment(event: FormEvent) {
    event.preventDefault();
    const invested = Number(amountInvested);
    const current = Number(currentValue || amountInvested);
    if (!name.trim() || invested <= 0 || current <= 0) return;

    const id = addInvestment({
      name: name.trim(),
      type,
      amountInvested: invested,
      currentValue: current,
      currency,
      startedAt,
      isVisible,
      note: note || undefined,
    });

    setName("");
    setAmountInvested("");
    setCurrentValue("");
    setStartedAt(new Date().toISOString().slice(0, 10));
    setIsVisible(true);
    setNote("");
    setIsCreateOpen(false);
    navigate(`/investments/${id}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Investments"
        title="Inversiones"
        description="Crea inversiones manuales y entra al detalle para ver rendimiento y contexto."
      >
        {isEditing ? (
          <>
            <Button variant="outline" onClick={cancelEditingInvestments}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={saveInvestmentEdits}>
              <Save className="h-4 w-4" />
              Guardar
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setShowHidden((current) => !current)}>
              {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showHidden ? "Ocultar ocultas" : `Mostrar ocultas (${hiddenInvestments.length})`}
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Editar inversiones"
              disabled={dataset.investments.length === 0}
              onClick={startEditingInvestments}
            >
              <Edit3 className="h-5 w-5" />
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" aria-label="Nueva inversion">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva inversion</DialogTitle>
                  <DialogDescription>
                    Carga una inversion manual para seguir valor actual y rendimiento.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreateInvestment}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Nombre</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                      placeholder="Fondo, accion, deposito..."
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Tipo</span>
                      <select
                        value={type}
                        onChange={(event) =>
                          setType(event.target.value as Investment["type"])
                        }
                        className={inputClassName}
                      >
                        {investmentTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Moneda</span>
                      <select
                        value={currency}
                        onChange={(event) =>
                          setCurrency(event.target.value as CurrencyCode)
                        }
                        className={inputClassName}
                      >
                        <option value="UYU">UYU</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="BRL">BRL</option>
                        <option value="ARS">ARS</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Invertido</span>
                      <input
                        value={amountInvested}
                        onChange={(event) => setAmountInvested(event.target.value)}
                        type="number"
                        className={inputClassName}
                        placeholder="10000"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Valor actual</span>
                      <input
                        value={currentValue}
                        onChange={(event) => setCurrentValue(event.target.value)}
                        type="number"
                        className={inputClassName}
                        placeholder="Opcional"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Inicio</span>
                      <input
                        value={startedAt}
                        onChange={(event) => setStartedAt(event.target.value)}
                        type="date"
                        className={inputClassName}
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Visibilidad</span>
                      <select
                        value={isVisible ? "visible" : "hidden"}
                        onChange={(event) =>
                          setIsVisible(event.target.value === "visible")
                        }
                        className={inputClassName}
                      >
                        <option value="visible">Visible</option>
                        <option value="hidden">Oculta</option>
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Nota</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className={textareaClassName}
                      placeholder="Contexto opcional"
                    />
                  </label>
                  <Button className="w-full" type="submit">
                    <Plus className="h-4 w-4" />
                    Crear y abrir detalle
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className={isEditing ? "xl:col-span-2" : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Inversiones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {editError}
              </div>
            ) : null}
            {isEditing ? (
              <div className="grid gap-3 md:grid-cols-2">
                {visibleInvestmentDrafts.map((draft) => (
                  <div key={draft.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <label className="block flex-1 space-y-2">
                        <span className="text-sm font-medium">Nombre</span>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              name: event.target.value,
                            })
                          }
                          className={inputClassName}
                          placeholder="Nombre"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => markInvestmentForDeletion(draft.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Tipo</span>
                        <select
                          value={draft.type}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              type: event.target.value as Investment["type"],
                            })
                          }
                          className={inputClassName}
                        >
                          {investmentTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Moneda</span>
                        <select
                          value={draft.currency}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              currency: event.target.value as CurrencyCode,
                            })
                          }
                          className={inputClassName}
                        >
                          <option value="UYU">UYU</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="BRL">BRL</option>
                          <option value="ARS">ARS</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Invertido</span>
                        <input
                          value={draft.amountInvested}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              amountInvested: event.target.value,
                            })
                          }
                          type="number"
                          className={inputClassName}
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Valor actual</span>
                        <input
                          value={draft.currentValue}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              currentValue: event.target.value,
                            })
                          }
                          type="number"
                          className={inputClassName}
                        />
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Inicio</span>
                        <input
                          value={draft.startedAt}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              startedAt: event.target.value,
                            })
                          }
                          type="date"
                          className={inputClassName}
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Visibilidad</span>
                        <select
                          value={draft.isVisible ? "visible" : "hidden"}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              isVisible: event.target.value === "visible",
                            })
                          }
                          className={inputClassName}
                        >
                          <option value="visible">Visible</option>
                          <option value="hidden">Oculta</option>
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block space-y-2">
                      <span className="text-sm font-medium">Nota</span>
                      <textarea
                        value={draft.note}
                        onChange={(event) =>
                          updateInvestmentDraft(draft.id, {
                            note: event.target.value,
                          })
                        }
                        className={textareaClassName}
                        placeholder="Contexto opcional"
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {renderedInvestments.map((investment) => {
                  const gain = investment.currentValue - investment.amountInvested;
                  const percentage =
                    (investment.currentValue / investment.amountInvested) * 100;
                  return (
                    <button
                      key={investment.id}
                      type="button"
                      onClick={() => navigate(`/investments/${investment.id}`)}
                      className="w-full rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{investment.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {investment.type}
                          </p>
                        </div>
                        {!investment.isVisible ? (
                          <Badge variant="muted">
                            <EyeOff className="mr-1 h-3 w-3" />
                            Oculta
                          </Badge>
                        ) : null}
                      </div>
                      <Progress
                        value={Math.min(100, percentage)}
                        className="mt-3"
                        indicatorClassName={gain >= 0 ? "bg-emerald-500" : "bg-red-500"}
                      />
                      <div className="mt-3 flex justify-between text-sm">
                        <span>Actual</span>
                        <span className="font-semibold">
                          {formatMoney(investment.currentValue, investment.currency)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm">
                        <span>Resultado</span>
                        <span className={gain >= 0 ? "text-emerald-600" : "text-red-600"}>
                          {formatMoney(gain, investment.currency)}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {!showHidden && hiddenInvestments.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Hay {hiddenInvestments.length} inversion(es) oculta(s). Usa
                    "Mostrar ocultas" para administrarlas.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Deudas y prestamos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dataset.debts.map((debt) => {
              const paid = debt.originalAmount - debt.pendingAmount;
              const percentage = (paid / debt.originalAmount) * 100;
              return (
                <div key={debt.id} className="rounded-md border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">{debt.name}</p>
                    <p className="font-semibold">
                      {formatMoney(debt.pendingAmount, debt.currency)}
                    </p>
                  </div>
                  <Progress value={percentage} className="mt-3" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Pagado {percentage.toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4" />
              Cuotas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dataset.installmentPlans.map((plan) => {
              const percentage = (plan.installmentsPaid / plan.installmentsTotal) * 100;
              return (
                <div key={plan.id} className="rounded-md border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">{plan.name}</p>
                    <p className="font-semibold">
                      {plan.installmentsPaid}/{plan.installmentsTotal}
                    </p>
                  </div>
                  <Progress value={percentage} className="mt-3" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Total {formatMoney(plan.totalAmount, plan.currency)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
