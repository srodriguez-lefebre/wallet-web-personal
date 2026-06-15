import { FormEvent, useState } from "react";
import {
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Save,
  Star,
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
import { useWallet } from "@/providers/wallet-provider";
import { calculateAccountBalances, formatMoney } from "@shared/calculations";
import type { Account, AccountType, CurrencyCode } from "@shared/types";

interface AccountDraft {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: string;
  color: string;
  isVisible: boolean;
  isActive: boolean;
  isPrimary: boolean;
  note: string;
  isDeleted: boolean;
}

const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Efectivo" },
  { value: "bank", label: "Banco" },
  { value: "credit_card", label: "Tarjeta" },
  { value: "savings", label: "Ahorro" },
  { value: "recurring", label: "Recurrente" },
  { value: "investment", label: "Inversion" },
  { value: "custom", label: "Personalizada" },
];

function buildAccountDrafts(
  accounts: Account[],
  primaryAccountId?: string,
): AccountDraft[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    initialBalance: String(account.initialBalance),
    color: account.color,
    isVisible: account.isVisible,
    isActive: account.isActive,
    isPrimary: account.id === primaryAccountId,
    note: account.note ?? "",
    isDeleted: false,
  }));
}

export function AccountsView() {
  const navigate = useNavigate();
  const {
    dataset,
    addAccount,
    updateAccount,
    deleteAccount,
    setRecordFilters,
    setPrimaryAccount,
  } = useWallet();
  const [showHidden, setShowHidden] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [accountDrafts, setAccountDrafts] = useState<AccountDraft[]>(() =>
    buildAccountDrafts(dataset.accounts, dataset.settings.primaryAccountId),
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [initialBalance, setInitialBalance] = useState("");
  const [color, setColor] = useState("#2563EB");
  const [isVisible, setIsVisible] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");
  const balances = calculateAccountBalances(dataset);
  const visibleBalances = balances.filter((item) => item.account.isVisible);
  const hiddenBalances = balances.filter((item) => !item.account.isVisible);
  const visibleAccountDrafts = accountDrafts.filter(
    (draft) => !draft.isDeleted && (showHidden || draft.isVisible),
  );
  const inputClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const textareaClassName =
    "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  function openAccountRecords(accountId: string) {
    setRecordFilters({ accountId, type: "all" });
    navigate("/records");
  }

  function startEditingAccounts() {
    setAccountDrafts(
      buildAccountDrafts(dataset.accounts, dataset.settings.primaryAccountId),
    );
    setShowHidden(false);
    setEditError("");
    setIsEditing(true);
  }

  function cancelEditingAccounts() {
    setAccountDrafts(
      buildAccountDrafts(dataset.accounts, dataset.settings.primaryAccountId),
    );
    setShowHidden(false);
    setEditError("");
    setIsEditing(false);
  }

  function updateAccountDraft(
    accountIdToUpdate: string,
    patch: Partial<AccountDraft>,
  ) {
    setAccountDrafts((current) =>
      current.map((draft) => {
        if (patch.isPrimary && draft.id !== accountIdToUpdate) {
          return {
            ...draft,
            isPrimary: false,
          };
        }

        return draft.id === accountIdToUpdate
          ? {
              ...draft,
              ...patch,
            }
          : draft;
      }),
    );
  }

  function markAccountForDeletion(accountIdToDelete: string) {
    setAccountDrafts((current) =>
      current.map((draft) =>
        draft.id === accountIdToDelete
          ? {
              ...draft,
              isDeleted: true,
              isPrimary: false,
            }
          : draft,
      ),
    );
  }

  function saveAccountEdits() {
    const activeDrafts = accountDrafts.filter((draft) => !draft.isDeleted);
    const invalidDraft = activeDrafts.find(
      (draft) => !draft.name.trim() || Number.isNaN(Number(draft.initialBalance)),
    );

    if (invalidDraft) {
      setEditError("Revisa que cada cuenta tenga nombre y balance valido.");
      return;
    }

    accountDrafts
      .filter((draft) => draft.isDeleted)
      .forEach((draft) => deleteAccount(draft.id));

    activeDrafts.forEach((draft) => {
      const currentAccount = dataset.accounts.find(
        (account) => account.id === draft.id,
      );
      if (!currentAccount) return;

      updateAccount(draft.id, {
        name: draft.name.trim(),
        type: draft.type,
        currency: draft.currency,
        initialBalance: Number(draft.initialBalance),
        color: draft.color,
        icon: currentAccount.icon,
        isVisible: draft.isVisible,
        isActive: draft.isActive,
        note: draft.note.trim() || undefined,
      });
    });

    const primaryDraft =
      activeDrafts.find((draft) => draft.isPrimary) ??
      activeDrafts.find((draft) => draft.isVisible) ??
      activeDrafts[0];
    if (primaryDraft) {
      setPrimaryAccount(primaryDraft.id);
    }

    setShowHidden(false);
    setEditError("");
    setIsEditing(false);
  }

  function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || Number.isNaN(Number(initialBalance))) return;

    const id = addAccount({
      name: name.trim(),
      type,
      currency,
      initialBalance: Number(initialBalance),
      color,
      icon: type === "credit_card" ? "credit-card" : "wallet",
      isVisible,
      isActive,
      note: note.trim() || undefined,
    });

    if (!dataset.settings.primaryAccountId) {
      setPrimaryAccount(id);
    }

    setName("");
    setInitialBalance("");
    setColor("#2563EB");
    setIsVisible(true);
    setIsActive(true);
    setNote("");
    setIsCreateOpen(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Accounts"
        title="Cuentas"
        description="Toca una cuenta para ver sus registros. Edita, crea y controla visibilidad desde aca."
      >
        {isEditing ? (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label={showHidden ? "Ocultar cuentas ocultas" : "Ver cuentas ocultas"}
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
            <Button variant="outline" onClick={cancelEditingAccounts}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={saveAccountEdits}>
              <Save className="h-4 w-4" />
              Guardar
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label="Editar cuentas"
              disabled={dataset.accounts.length === 0}
              onClick={startEditingAccounts}
            >
              <Edit3 className="h-5 w-5" />
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" aria-label="Nueva cuenta">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva cuenta</DialogTitle>
                  <DialogDescription>
                    Crea una cuenta para efectivo, banco, tarjeta, ahorro o uso custom.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreateAccount}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Nombre</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                      placeholder="Banco, efectivo, tarjeta..."
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Tipo</span>
                      <select
                        value={type}
                        onChange={(event) => setType(event.target.value as AccountType)}
                        className={inputClassName}
                      >
                        {accountTypeOptions.map((option) => (
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
                      <span className="text-sm font-medium">Balance inicial</span>
                      <input
                        value={initialBalance}
                        onChange={(event) => setInitialBalance(event.target.value)}
                        type="number"
                        className={inputClassName}
                        placeholder="0"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Color</span>
                      <input
                        value={color}
                        onChange={(event) => setColor(event.target.value)}
                        type="color"
                        className="h-10 w-full rounded-md border bg-background px-2"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Estado</span>
                      <select
                        value={isActive ? "active" : "inactive"}
                        onChange={(event) =>
                          setIsActive(event.target.value === "active")
                        }
                        className={inputClassName}
                      >
                        <option value="active">Activa</option>
                        <option value="inactive">Inactiva</option>
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
                    Crear cuenta
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </PageHeader>

      {isEditing ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleAccountDrafts.map((draft) => (
            <Card key={draft.id} className="border-primary/30 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 items-start gap-3">
                    <label className="block space-y-2">
                      <span className="sr-only">Color</span>
                      <input
                        value={draft.color}
                        onChange={(event) =>
                          updateAccountDraft(draft.id, { color: event.target.value })
                        }
                        type="color"
                        className="h-10 w-10 cursor-pointer rounded-md border bg-background p-1"
                        aria-label={`Color de ${draft.name || "cuenta"}`}
                      />
                    </label>
                    <label className="block flex-1 space-y-2">
                      <span className="text-sm font-medium">Nombre</span>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          updateAccountDraft(draft.id, { name: event.target.value })
                        }
                        className={inputClassName}
                        placeholder="Nombre de la cuenta"
                      />
                    </label>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => markAccountForDeletion(draft.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Tipo</span>
                    <select
                      value={draft.type}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
                          type: event.target.value as AccountType,
                        })
                      }
                      className={inputClassName}
                    >
                      {accountTypeOptions.map((option) => (
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
                        updateAccountDraft(draft.id, {
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Balance inicial</span>
                    <input
                      value={draft.initialBalance}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
                          initialBalance: event.target.value,
                        })
                      }
                      type="number"
                      className={inputClassName}
                      placeholder="0"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Visibilidad</span>
                    <select
                      value={draft.isVisible ? "visible" : "hidden"}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Estado</span>
                    <select
                      value={draft.isActive ? "active" : "inactive"}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
                          isActive: event.target.value === "active",
                        })
                      }
                      className={inputClassName}
                    >
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Principal</span>
                    <select
                      value={draft.isPrimary ? "primary" : "normal"}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
                          isPrimary: event.target.value === "primary",
                        })
                      }
                      className={inputClassName}
                    >
                      <option value="normal">Normal</option>
                      <option value="primary">Principal</option>
                    </select>
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Nota</span>
                  <textarea
                    value={draft.note}
                    onChange={(event) =>
                      updateAccountDraft(draft.id, { note: event.target.value })
                    }
                    className={textareaClassName}
                    placeholder="Contexto opcional"
                  />
                </label>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleBalances.map(({ account, balance, freeBalance, reserved }) => {
            const isPrimary = dataset.settings.primaryAccountId === account.id;

            return (
              <Card
                key={account.id}
                role="button"
                tabIndex={0}
                onClick={() => openAccountRecords(account.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openAccountRecords(account.id);
                  }
                }}
                className="cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {account.name}
                        {isPrimary ? (
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ) : null}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {account.type}
                      </p>
                    </div>
                    <Badge variant={account.isVisible ? "success" : "muted"}>
                      {account.isVisible ? (
                        <Eye className="mr-1 h-3 w-3" />
                      ) : (
                        <EyeOff className="mr-1 h-3 w-3" />
                      )}
                      {account.isVisible ? "Visible" : "Oculta"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">
                    {formatMoney(balance, account.currency)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-muted-foreground">Libre</p>
                      <p className="font-medium">
                        {formatMoney(freeBalance, account.currency)}
                      </p>
                    </div>
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-muted-foreground">Reservado</p>
                      <p className="font-medium">
                        {formatMoney(reserved, account.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: account.color }}
                    />
                    {account.currency} · {account.isActive ? "Activa" : "Inactiva"}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant={isPrimary ? "secondary" : "outline"}
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPrimaryAccount(account.id);
                      }}
                    >
                      <Star className="h-4 w-4" />
                      {isPrimary ? "Principal" : "Set principal"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editError ? (
        <Card className="mt-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {editError}
          </CardContent>
        </Card>
      ) : null}

      {!isEditing && hiddenBalances.length > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Hay {hiddenBalances.length} cuenta(s) oculta(s). Entra al modo edicion
          para verlas y administrarlas.
        </p>
      ) : null}
    </div>
  );
}
