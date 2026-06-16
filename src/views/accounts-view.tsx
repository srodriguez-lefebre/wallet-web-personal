import { FormEvent, useState } from "react";
import {
  BarChart3,
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
import { accountTypeLabels } from "@shared/constants";
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
  { value: "cash", label: accountTypeLabels.cash },
  { value: "bank", label: accountTypeLabels.bank },
  { value: "credit_card", label: accountTypeLabels.credit_card },
  { value: "savings", label: accountTypeLabels.savings },
  { value: "recurring", label: accountTypeLabels.recurring },
  { value: "investment", label: accountTypeLabels.investment },
  { value: "custom", label: accountTypeLabels.custom },
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
  const visibleAccountDrafts = accountDrafts.filter(
    (draft) => !draft.isDeleted && (showHidden || draft.isVisible),
  );
  const inputClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const textareaClassName =
    "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const colorInputClassName =
    "h-10 w-10 cursor-pointer rounded-full border bg-background p-1 [appearance:none] [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0";

  function openAccountRecords(accountId: string) {
    setRecordFilters({ accountId, type: "all" });
    navigate("/records");
  }

  function openAccountAnalytics(accountId: string) {
    setRecordFilters({ accountId, type: "all" });
    navigate("/analytics");
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

  async function saveAccountEdits() {
    const activeDrafts = accountDrafts.filter((draft) => !draft.isDeleted);
    const invalidDraft = activeDrafts.find(
      (draft) => !draft.name.trim() || Number.isNaN(Number(draft.initialBalance)),
    );

    if (invalidDraft) {
      setEditError("Make sure every account has a name and a valid balance.");
      return;
    }

    await Promise.all(
      accountDrafts
        .filter((draft) => draft.isDeleted)
        .map((draft) => deleteAccount(draft.id)),
    );

    await Promise.all(
      activeDrafts.map((draft) => {
        const currentAccount = dataset.accounts.find(
          (account) => account.id === draft.id,
        );
        if (!currentAccount) return Promise.resolve();

        return updateAccount(draft.id, {
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
      }),
    );

    const primaryDraft =
      activeDrafts.find((draft) => draft.isPrimary) ??
      activeDrafts.find((draft) => draft.isVisible) ??
      activeDrafts[0];
    if (primaryDraft) {
      await setPrimaryAccount(primaryDraft.id);
    }

    setShowHidden(false);
    setEditError("");
    setIsEditing(false);
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || Number.isNaN(Number(initialBalance))) return;

    const id = await addAccount({
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
      await setPrimaryAccount(id);
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
        title="Accounts"
        description="Open an account to inspect its records. Edit, create, and control visibility here."
      >
        {isEditing ? (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label={showHidden ? "Hide hidden accounts" : "Show hidden accounts"}
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
            <Button variant="outline" onClick={cancelEditingAccounts}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={saveAccountEdits}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label="Edit accounts"
              disabled={dataset.accounts.length === 0}
              onClick={startEditingAccounts}
            >
              <Edit3 className="h-5 w-5" />
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" aria-label="New account">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New account</DialogTitle>
                  <DialogDescription>
                    Create an account for cash, bank, card, savings, or custom use.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreateAccount}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                      placeholder="Banco, efectivo, tarjeta..."
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Type</span>
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
                      <span className="text-sm font-medium">Currency</span>
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
                      <span className="text-sm font-medium">Initial balance</span>
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
                        className={colorInputClassName}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Visibility</span>
                      <select
                        value={isVisible ? "visible" : "hidden"}
                        onChange={(event) =>
                          setIsVisible(event.target.value === "visible")
                        }
                        className={inputClassName}
                      >
                        <option value="visible">Visible</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Status</span>
                      <select
                        value={isActive ? "active" : "inactive"}
                        onChange={(event) =>
                          setIsActive(event.target.value === "active")
                        }
                        className={inputClassName}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Note</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className={textareaClassName}
                      placeholder="Optional context"
                    />
                  </label>
                  <Button className="w-full" type="submit">
                    <Plus className="h-4 w-4" />
                    Create account
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
                        className={colorInputClassName}
                        aria-label={`${draft.name || "Account"} color`}
                      />
                    </label>
                    <label className="block flex-1 space-y-2">
                      <span className="text-sm font-medium">Name</span>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          updateAccountDraft(draft.id, { name: event.target.value })
                        }
                        className={inputClassName}
                        placeholder="Account name"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={draft.isVisible ? "Hide account" : "Show account"}
                      title={draft.isVisible ? "Hide account" : "Show account"}
                      onClick={() =>
                        updateAccountDraft(draft.id, {
                          isVisible: !draft.isVisible,
                        })
                      }
                    >
                      {draft.isVisible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      aria-label="Delete account"
                      title="Delete account"
                      onClick={() => markAccountForDeletion(draft.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Type</span>
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
                    <span className="text-sm font-medium">Currency</span>
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
                    <span className="text-sm font-medium">Initial balance</span>
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
                    <span className="text-sm font-medium">Status</span>
                    <select
                      value={draft.isActive ? "active" : "inactive"}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
                          isActive: event.target.value === "active",
                        })
                      }
                      className={inputClassName}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                  <span className="text-sm font-medium">Primary</span>
                    <select
                      value={draft.isPrimary ? "primary" : "normal"}
                      onChange={(event) =>
                        updateAccountDraft(draft.id, {
                          isPrimary: event.target.value === "primary",
                        })
                      }
                      className={inputClassName}
                    >
                    <option value="normal">Regular</option>
                    <option value="primary">Primary</option>
                    </select>
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Note</span>
                  <textarea
                    value={draft.note}
                    onChange={(event) =>
                      updateAccountDraft(draft.id, { note: event.target.value })
                    }
                    className={textareaClassName}
                    placeholder="Optional context"
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
                        {accountTypeLabels[account.type]}
                      </p>
                    </div>
                    <Badge variant={account.isVisible ? "success" : "muted"}>
                      {account.isVisible ? (
                        <Eye className="mr-1 h-3 w-3" />
                      ) : (
                        <EyeOff className="mr-1 h-3 w-3" />
                      )}
                      {account.isVisible ? "Visible" : "Hidden"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">
                    {formatMoney(balance, account.currency)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-muted-foreground">Free</p>
                      <p className="font-medium">
                        {formatMoney(freeBalance, account.currency)}
                      </p>
                    </div>
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-muted-foreground">Reserved</p>
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
                    {account.currency} · {account.isActive ? "Active" : "Inactive"}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openAccountAnalytics(account.id);
                      }}
                    >
                      <BarChart3 className="h-4 w-4" />
                      Analytics
                    </Button>
                    <Button
                      variant={isPrimary ? "secondary" : "outline"}
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPrimaryAccount(account.id);
                      }}
                    >
                      <Star className="h-4 w-4" />
                      {isPrimary ? "Primary" : "Set primary"}
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
    </div>
  );
}
