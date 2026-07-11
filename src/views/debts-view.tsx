import { FormEvent, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  Plus,
  Repeat2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { ActionToast } from "@/components/ui/action-toast";
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
import { CategoryPicker } from "@/components/wallet/category-picker";
import { useActionToast } from "@/lib/use-action-toast";
import { limitDecimalPlaces } from "@/lib/utils";
import { useWallet } from "@/providers/wallet-provider";
import {
  calculateVisibleDebtSummary,
  formatMoney,
  isOpenDebt,
} from "@shared/calculations";
import { debtDirectionLabels, debtStatusLabels } from "@shared/constants";
import type {
  CurrencyCode,
  Debt,
  DebtDirection,
  DebtStatus,
  RecurringDebt,
} from "@shared/types";

type DebtTab = "open" | "recurring" | "closed";

interface DebtFormState {
  name: string;
  direction: DebtDirection;
  originalAmount: string;
  pendingAmount: string;
  currency: CurrencyCode;
  counterpartyName: string;
  accountId: string;
  categoryId: string;
  status: DebtStatus;
  isVisible: boolean;
  startedAt: string;
  dueAt: string;
  note: string;
}

interface RecurringDebtFormState {
  name: string;
  direction: DebtDirection;
  amount: string;
  currency: CurrencyCode;
  counterpartyName: string;
  accountId: string;
  categoryId: string;
  dayOfMonth: string;
  isActive: boolean;
  startedAt: string;
  note: string;
}

const currencyOptions: CurrencyCode[] = ["UYU", "USD", "EUR", "BRL", "ARS"];
const inputClassName =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const textareaClassName =
  "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function dateToIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const now = new Date();
  return new Date(
    year,
    month - 1,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  ).toISOString();
}

function defaultDebtForm(categoryId = "", accountId = ""): DebtFormState {
  return {
    name: "",
    direction: "receivable",
    originalAmount: "",
    pendingAmount: "",
    currency: "UYU",
    counterpartyName: "",
    accountId,
    categoryId,
    status: "active",
    isVisible: true,
    startedAt: todayDate(),
    dueAt: "",
    note: "",
  };
}

function debtToForm(debt: Debt): DebtFormState {
  return {
    name: debt.name,
    direction: debt.direction,
    originalAmount:
      debt.originalAmount === undefined ? "" : String(debt.originalAmount),
    pendingAmount:
      debt.pendingAmount === undefined ? "" : String(debt.pendingAmount),
    currency: debt.currency,
    counterpartyName: debt.counterpartyName,
    accountId: debt.accountId ?? "",
    categoryId: debt.categoryId,
    status: debt.status,
    isVisible: debt.isVisible,
    startedAt: toDateInput(debt.startedAt),
    dueAt: toDateInput(debt.dueAt),
    note: debt.note ?? "",
  };
}

function defaultRecurringForm(categoryId = "", accountId = ""): RecurringDebtFormState {
  return {
    name: "",
    direction: "receivable",
    amount: "",
    currency: "UYU",
    counterpartyName: "",
    accountId,
    categoryId,
    dayOfMonth: "3",
    isActive: true,
    startedAt: todayDate(),
    note: "",
  };
}

function recurringDebtToForm(
  recurringDebt: RecurringDebt,
): RecurringDebtFormState {
  return {
    name: recurringDebt.name,
    direction: recurringDebt.direction,
    amount:
      recurringDebt.amount === undefined ? "" : String(recurringDebt.amount),
    currency: recurringDebt.currency,
    counterpartyName: recurringDebt.counterpartyName,
    accountId: recurringDebt.accountId ?? "",
    categoryId: recurringDebt.categoryId,
    dayOfMonth: String(recurringDebt.dayOfMonth),
    isActive: recurringDebt.isActive,
    startedAt: toDateInput(recurringDebt.startedAt),
    note: recurringDebt.note ?? "",
  };
}

function debtProgress(debt: Debt) {
  if (debt.originalAmount === undefined || debt.pendingAmount === undefined) {
    return 0;
  }

  return ((debt.originalAmount - debt.pendingAmount) / debt.originalAmount) * 100;
}

function dueVariant(dueAt?: string) {
  if (!dueAt) return "muted";

  const today = new Date(`${todayDate()}T12:00:00.000Z`);
  const dueDate = new Date(dueAt);
  const days = Math.ceil(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (days < 0) return "danger";
  if (days <= 7) return "info";
  return "muted";
}

function dueLabel(dueAt?: string) {
  if (!dueAt) return "No due date";

  const today = new Date(`${todayDate()}T12:00:00.000Z`);
  const dueDate = new Date(dueAt);
  const days = Math.ceil(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}

function defaultAccountId(dataset: { accounts: Array<{ id: string; isActive: boolean; isVisible: boolean }>; settings: { primaryAccountId?: string } }) {
  const visibleActiveAccounts = dataset.accounts.filter(
    (account) => account.isActive && account.isVisible,
  );

  return (
    visibleActiveAccounts.find(
      (account) => account.id === dataset.settings.primaryAccountId,
    )?.id ??
    visibleActiveAccounts[0]?.id ??
    dataset.accounts[0]?.id ??
    ""
  );
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: DebtDirection;
  onChange: (direction: DebtDirection) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-md border bg-secondary p-1">
      {(
        [
          ["receivable", "They owe me"],
          ["payable", "I owe"],
        ] as Array<[DebtDirection, string]>
      ).map(([direction, label]) => (
        <button
          key={direction}
          type="button"
          onClick={() => onChange(direction)}
          className={
            value === direction
              ? direction === "receivable"
                ? "rounded-sm bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                : "rounded-sm bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
              : "rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function DebtsView() {
  const {
    dataset,
    addDebt,
    updateDebt,
    deleteDebt,
    recordDebtPayment,
    addRecurringDebt,
    updateRecurringDebt,
    deleteRecurringDebt,
  } = useWallet();
  const [tab, setTab] = useState<DebtTab>("open");
  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState("");
  const [editingRecurringDebtId, setEditingRecurringDebtId] = useState("");
  const [paymentDebtId, setPaymentDebtId] = useState("");
  const [formError, setFormError] = useState("");
  const [showDebtMore, setShowDebtMore] = useState(false);
  const [debtForm, setDebtForm] = useState<DebtFormState>(() =>
    defaultDebtForm("", defaultAccountId(dataset)),
  );
  const [recurringForm, setRecurringForm] =
    useState<RecurringDebtFormState>(() =>
      defaultRecurringForm("", defaultAccountId(dataset)),
    );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDate());
  const [paymentNote, setPaymentNote] = useState("");
  const [saveAccountToDebt, setSaveAccountToDebt] = useState(true);
  const { toast, runAction } = useActionToast();
  const openDebts = useMemo(
    () =>
      dataset.debts
        .filter(isOpenDebt)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
    [dataset.debts],
  );
  const closedDebts = dataset.debts.filter((debt) => !isOpenDebt(debt));
  const summary = calculateVisibleDebtSummary(dataset);
  const activePaymentDebt = dataset.debts.find(
    (debt) => debt.id === paymentDebtId,
  );

  function openCreateDebt() {
    setEditingDebtId("");
    setDebtForm(defaultDebtForm("", defaultAccountId(dataset)));
    setFormError("");
    setShowDebtMore(false);
    setDebtDialogOpen(true);
  }

  function openEditDebt(debt: Debt) {
    setEditingDebtId(debt.id);
    setDebtForm(debtToForm(debt));
    setFormError("");
    setShowDebtMore(false);
    setDebtDialogOpen(true);
  }

  function openCreateRecurringDebt() {
    setEditingRecurringDebtId("");
    setRecurringForm(defaultRecurringForm("", defaultAccountId(dataset)));
    setFormError("");
    setRecurringDialogOpen(true);
  }

  function openEditRecurringDebt(recurringDebt: RecurringDebt) {
    setEditingRecurringDebtId(recurringDebt.id);
    setRecurringForm(recurringDebtToForm(recurringDebt));
    setFormError("");
    setRecurringDialogOpen(true);
  }

  function openPayment(debt: Debt) {
    setPaymentDebtId(debt.id);
    setPaymentAmount(
      debt.pendingAmount === undefined ? "" : String(debt.pendingAmount),
    );
    setPaymentAccountId(debt.accountId ?? defaultAccountId(dataset));
    setPaymentDate(todayDate());
    setPaymentNote("");
    setSaveAccountToDebt(!debt.accountId);
    setFormError("");
    setPaymentDialogOpen(true);
  }

  function buildDebtPayload(): Omit<Debt, "id"> | null {
    if (
      !debtForm.name.trim() ||
      !debtForm.counterpartyName.trim() ||
      !debtForm.categoryId ||
      !debtForm.originalAmount ||
      !debtForm.startedAt
    ) {
      setFormError(
        "Name, counterparty, original amount, category, and start date are required.",
      );
      return null;
    }

    const originalAmount = Number(debtForm.originalAmount);
    const pendingAmount = debtForm.pendingAmount
      ? Number(debtForm.pendingAmount)
      : originalAmount;

    if (
      originalAmount <= 0 ||
      pendingAmount < 0 ||
      pendingAmount > originalAmount
    ) {
      setFormError("Original amount must be positive and pending cannot exceed it.");
      return null;
    }

    return {
      name: debtForm.name.trim(),
      direction: debtForm.direction,
      originalAmount,
      pendingAmount,
      currency: debtForm.currency,
      counterpartyName: debtForm.counterpartyName.trim(),
      accountId: debtForm.accountId || undefined,
      categoryId: debtForm.categoryId,
      status: debtForm.status,
      isVisible: debtForm.isVisible,
      startedAt: dateToIso(debtForm.startedAt),
      dueAt: debtForm.dueAt ? dateToIso(debtForm.dueAt) : undefined,
      note: debtForm.note.trim() || undefined,
    };
  }

  async function handleDebtSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = buildDebtPayload();
    if (!payload) return;

    if (editingDebtId) {
      const currentDebt = dataset.debts.find((debt) => debt.id === editingDebtId);
      await runAction(
        () =>
          updateDebt(editingDebtId, {
            ...payload,
            recurringDebtId: currentDebt?.recurringDebtId,
            recurringMonth: currentDebt?.recurringMonth,
          }),
        {
          processing: "Saving debt...",
          success: "Debt saved",
          error: "Could not save debt",
        },
      );
    } else {
      await runAction(() => addDebt(payload), {
        processing: "Creating debt...",
        success: "Debt created",
        error: "Could not create debt",
      });
    }

    setDebtDialogOpen(false);
  }

  function buildRecurringPayload(): Omit<RecurringDebt, "id"> | null {
    if (
      !recurringForm.name.trim() ||
      !recurringForm.counterpartyName.trim() ||
      !recurringForm.categoryId ||
      !recurringForm.startedAt
    ) {
      setFormError("Name, counterparty, category, and start date are required.");
      return null;
    }

    const dayOfMonth = Number(recurringForm.dayOfMonth);
    const amount = recurringForm.amount ? Number(recurringForm.amount) : undefined;
    if (dayOfMonth < 1 || dayOfMonth > 31 || (amount !== undefined && amount <= 0)) {
      setFormError("Use a monthly day from 1 to 31 and a positive amount.");
      return null;
    }

    return {
      name: recurringForm.name.trim(),
      direction: recurringForm.direction,
      amount,
      currency: recurringForm.currency,
      counterpartyName: recurringForm.counterpartyName.trim(),
      accountId: recurringForm.accountId || undefined,
      categoryId: recurringForm.categoryId,
      dayOfMonth,
      isActive: recurringForm.isActive,
      startedAt: dateToIso(recurringForm.startedAt),
      note: recurringForm.note.trim() || undefined,
    };
  }

  async function handleRecurringSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = buildRecurringPayload();
    if (!payload) return;

    if (editingRecurringDebtId) {
      await runAction(
        () => updateRecurringDebt(editingRecurringDebtId, payload),
        {
          processing: "Saving recurring debt...",
          success: "Recurring debt saved",
          error: "Could not save recurring debt",
        },
      );
    } else {
      await runAction(() => addRecurringDebt(payload), {
        processing: "Creating recurring debt...",
        success: "Recurring debt created",
        error: "Could not create recurring debt",
      });
    }

    setRecurringDialogOpen(false);
  }

  async function handlePaymentSubmit(event: FormEvent) {
    event.preventDefault();
    if (!activePaymentDebt) return;

    const amount = Number(paymentAmount);
    if (
      amount <= 0 ||
      !paymentAccountId ||
      !paymentDate ||
      activePaymentDebt.pendingAmount === undefined ||
      amount > activePaymentDebt.pendingAmount
    ) {
      setFormError("Select an account and enter a valid amount.");
      return;
    }

    await runAction(
      () =>
        recordDebtPayment(activePaymentDebt.id, {
          amount,
          accountId: paymentAccountId,
          occurredAt: dateToIso(paymentDate),
          note: paymentNote.trim() || undefined,
          saveAccountToDebt,
        }),
      {
        processing:
          activePaymentDebt.direction === "receivable"
            ? "Collecting debt..."
            : "Paying debt...",
        success:
          activePaymentDebt.direction === "receivable"
            ? "Debt collected"
            : "Debt paid",
        error: "Could not save payment",
      },
    );
    setPaymentDialogOpen(false);
  }

  async function settleDebt(debt: Debt) {
    if (!debt.accountId || debt.pendingAmount === undefined) return;

    await runAction(
      () =>
        recordDebtPayment(debt.id, {
          amount: debt.pendingAmount ?? 0,
          accountId: debt.accountId ?? "",
          occurredAt: dateToIso(todayDate()),
          note:
            debt.direction === "receivable"
              ? `Full debt received: ${debt.name}`
              : `Full debt paid: ${debt.name}`,
          saveAccountToDebt: true,
        }),
      {
        processing:
          debt.direction === "receivable"
            ? "Receiving debt..."
            : "Paying debt...",
        success:
          debt.direction === "receivable" ? "Debt received" : "Debt paid",
        error: "Could not close debt",
      },
    );
  }

  function renderDebtList(debts: Debt[]) {
    if (debts.length === 0) {
      return (
        <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
          No debts in this view.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {debts.map((debt) => {
          const category = dataset.categories.find(
            (item) => item.id === debt.categoryId,
          );
          const account = dataset.accounts.find(
            (item) => item.id === debt.accountId,
          );
          const hasAmount = debt.pendingAmount !== undefined;

          return (
            <div key={debt.id} className="rounded-md border bg-card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        debt.direction === "receivable" ? "success" : "danger"
                      }
                    >
                      {debtDirectionLabels[debt.direction]}
                    </Badge>
                    <Badge variant={dueVariant(debt.dueAt)}>
                      {dueLabel(debt.dueAt)}
                    </Badge>
                    <Badge variant={debt.isVisible ? "info" : "muted"}>
                      {debt.isVisible ? "Home" : "Hidden"}
                    </Badge>
                    <Badge variant="muted">{debtStatusLabels[debt.status]}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{debt.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {debt.counterpartyName} · {category?.name ?? "Category"} ·{" "}
                    {account?.name ?? "No account"}
                    {debt.note ? ` · ${debt.note}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isOpenDebt(debt) ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasAmount}
                        onClick={() => openPayment(debt)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Partial
                      </Button>
                      <Button
                        size="sm"
                        disabled={!hasAmount || !debt.accountId}
                        title={
                          debt.accountId
                            ? undefined
                            : "Assign an account to settle this debt directly."
                        }
                        onClick={() => void settleDebt(debt)}
                        className={
                          debt.direction === "receivable"
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "bg-red-600 text-white hover:bg-red-700"
                        }
                      >
                        <Banknote className="h-4 w-4" />
                        {debt.direction === "receivable" ? "Receive" : "Pay"}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Edit debt"
                    onClick={() => openEditDebt(debt)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Delete debt"
                    onClick={() =>
                      void runAction(() => deleteDebt(debt.id), {
                        processing: "Deleting debt...",
                        success: "Debt deleted",
                        error: "Could not delete debt",
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Pending
                  </p>
                  <p className="mt-1 font-semibold">
                    {hasAmount
                      ? formatMoney(debt.pendingAmount ?? 0, debt.currency)
                      : "Amount pending"}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Original
                  </p>
                  <p className="mt-1 font-semibold">
                    {debt.originalAmount === undefined
                      ? "Not set"
                      : formatMoney(debt.originalAmount, debt.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Linked records
                  </p>
                  <p className="mt-1 font-semibold">
                    {
                      dataset.records.filter((record) => record.debtId === debt.id)
                        .length
                    }
                  </p>
                </div>
              </div>

              {hasAmount ? (
                <Progress
                  value={debtProgress(debt)}
                  className="mt-4"
                  indicatorClassName={
                    debt.direction === "receivable"
                      ? "bg-emerald-500"
                      : "bg-red-500"
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <ActionToast toast={toast} />
      <PageHeader
        eyebrow="Debts"
        title="Debts"
        description="Track open debts, monthly recurring obligations, and partial payments that create wallet records."
      >
        <Button variant="outline" onClick={openCreateRecurringDebt}>
          <Repeat2 className="h-4 w-4" />
          Recurring
        </Button>
        <Button onClick={openCreateDebt}>
          <Plus className="h-4 w-4" />
          Debt
        </Button>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              To collect
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-600">
              {formatMoney(summary.toCollect, dataset.settings.primaryCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              To pay
            </p>
            <p className="mt-2 text-2xl font-semibold text-red-600">
              {formatMoney(summary.toPay, dataset.settings.primaryCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Net
            </p>
            <p
              className={
                summary.net >= 0
                  ? "mt-2 text-2xl font-semibold text-sky-700 dark:text-sky-300"
                  : "mt-2 text-2xl font-semibold text-red-600"
              }
            >
              {formatMoney(summary.net, dataset.settings.primaryCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Open
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {summary.openCount}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {summary.amountPendingCount} pending amount
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-b">
        {(
          [
            ["open", "Open", openDebts.length],
            ["recurring", "Recurring", dataset.recurringDebts.length],
            ["closed", "Closed", closedDebts.length],
          ] as Array<[DebtTab, string, number]>
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={
              tab === value
                ? "border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground"
                : "px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {label} <span className="text-xs text-muted-foreground">{count}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "open" ? renderDebtList(openDebts) : null}
        {tab === "closed" ? renderDebtList(closedDebts) : null}
        {tab === "recurring" ? (
          <Card>
            <CardHeader>
              <CardTitle>Monthly recurring debts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataset.recurringDebts.length === 0 ? (
                <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  No recurring rules yet.
                </div>
              ) : (
                dataset.recurringDebts.map((recurringDebt) => {
                  const category = dataset.categories.find(
                    (item) => item.id === recurringDebt.categoryId,
                  );
                  const account = dataset.accounts.find(
                    (item) => item.id === recurringDebt.accountId,
                  );

                  return (
                    <div
                      key={recurringDebt.id}
                      className="flex flex-col gap-3 rounded-md border p-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              recurringDebt.direction === "receivable"
                                ? "success"
                                : "danger"
                            }
                          >
                            {debtDirectionLabels[recurringDebt.direction]}
                          </Badge>
                          <Badge variant={recurringDebt.isActive ? "info" : "muted"}>
                            {recurringDebt.isActive ? "Active" : "Paused"}
                          </Badge>
                          <Badge variant="muted">
                            Day {recurringDebt.dayOfMonth}
                          </Badge>
                        </div>
                        <p className="mt-3 font-semibold">{recurringDebt.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {recurringDebt.counterpartyName} ·{" "}
                          {category?.name ?? "Category"} ·{" "}
                          {account?.name ?? "No account"}
                          {recurringDebt.note ? ` · ${recurringDebt.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 lg:justify-end">
                        <p className="font-semibold">
                          {recurringDebt.amount === undefined
                            ? "Amount pending"
                            : formatMoney(
                                recurringDebt.amount,
                                recurringDebt.currency,
                              )}
                        </p>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Edit recurring debt"
                          onClick={() => openEditRecurringDebt(recurringDebt)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Delete recurring debt"
                          onClick={() =>
                            void runAction(
                              () => deleteRecurringDebt(recurringDebt.id),
                              {
                                processing: "Deleting recurring debt...",
                                success: "Recurring debt deleted",
                                error: "Could not delete recurring debt",
                              },
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={debtDialogOpen} onOpenChange={setDebtDialogOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingDebtId ? "Edit debt" : "Create debt"}</DialogTitle>
            <DialogDescription>
              Category is required. Account can stay empty until payment.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleDebtSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Name</span>
                <input
                  value={debtForm.name}
                  onChange={(event) =>
                    setDebtForm({ ...debtForm, name: event.target.value })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Counterparty</span>
                <input
                  value={debtForm.counterpartyName}
                  onChange={(event) =>
                    setDebtForm({
                      ...debtForm,
                      counterpartyName: event.target.value,
                    })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Original amount</span>
                <input
                  value={debtForm.originalAmount}
                  onChange={(event) =>
                    setDebtForm({
                      ...debtForm,
                      originalAmount: limitDecimalPlaces(event.target.value),
                    })
                  }
                  className={inputClassName}
                  inputMode="decimal"
                  placeholder="Required"
                />
              </label>
              <div className="space-y-1 text-sm">
                <span>Category</span>
                <CategoryPicker
                  categories={dataset.categories}
                  value={debtForm.categoryId}
                  inputClassName={inputClassName}
                  onChange={(categoryId) =>
                    setDebtForm({ ...debtForm, categoryId })
                  }
                />
              </div>
              <div className="space-y-1 text-sm md:col-span-2">
                <span>Direction</span>
                <DirectionToggle
                  value={debtForm.direction}
                  onChange={(direction) =>
                    setDebtForm({
                      ...debtForm,
                      direction,
                    })
                  }
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDebtMore((current) => !current)}
              className="flex w-full items-center justify-between rounded-md border bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <span>More</span>
              {showDebtMore ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {showDebtMore ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>Pending amount</span>
                  <input
                    value={debtForm.pendingAmount}
                    onChange={(event) =>
                      setDebtForm({
                        ...debtForm,
                        pendingAmount: limitDecimalPlaces(event.target.value),
                      })
                    }
                    className={inputClassName}
                    inputMode="decimal"
                    placeholder="Defaults to original"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Currency</span>
                  <select
                    value={debtForm.currency}
                    onChange={(event) =>
                      setDebtForm({
                        ...debtForm,
                        currency: event.target.value as CurrencyCode,
                      })
                    }
                    className={inputClassName}
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Account</span>
                  <select
                    value={debtForm.accountId}
                    onChange={(event) =>
                      setDebtForm({ ...debtForm, accountId: event.target.value })
                    }
                    className={inputClassName}
                  >
                    <option value="">No account yet</option>
                    {dataset.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Status</span>
                  <select
                    value={debtForm.status}
                    onChange={(event) =>
                      setDebtForm({
                        ...debtForm,
                        status: event.target.value as DebtStatus,
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Started</span>
                  <input
                    type="date"
                    value={debtForm.startedAt}
                    onChange={(event) =>
                      setDebtForm({ ...debtForm, startedAt: event.target.value })
                    }
                    className={inputClassName}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Due</span>
                  <input
                    type="date"
                    value={debtForm.dueAt}
                    onChange={(event) =>
                      setDebtForm({ ...debtForm, dueAt: event.target.value })
                    }
                    className={inputClassName}
                  />
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={debtForm.isVisible}
                    onChange={(event) =>
                      setDebtForm({
                        ...debtForm,
                        isVisible: event.target.checked,
                      })
                    }
                  />
                  Show on Home
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span>Note</span>
                  <textarea
                    value={debtForm.note}
                    onChange={(event) =>
                      setDebtForm({ ...debtForm, note: event.target.value })
                    }
                    className={textareaClassName}
                  />
                </label>
              </div>
            ) : null}

            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDebtDialogOpen(false)}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit">
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingRecurringDebtId ? "Edit recurring debt" : "Create recurring debt"}
            </DialogTitle>
            <DialogDescription>
              Monthly rules create one open debt per due month.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRecurringSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Name</span>
                <input
                  value={recurringForm.name}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      name: event.target.value,
                    })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Counterparty</span>
                <input
                  value={recurringForm.counterpartyName}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      counterpartyName: event.target.value,
                    })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Direction</span>
                <select
                  value={recurringForm.direction}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      direction: event.target.value as DebtDirection,
                    })
                  }
                  className={inputClassName}
                >
                  <option value="payable">I owe</option>
                  <option value="receivable">They owe me</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Amount</span>
                <input
                  value={recurringForm.amount}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      amount: limitDecimalPlaces(event.target.value),
                    })
                  }
                  className={inputClassName}
                  inputMode="decimal"
                  placeholder="Optional"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Currency</span>
                <select
                  value={recurringForm.currency}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      currency: event.target.value as CurrencyCode,
                    })
                  }
                  className={inputClassName}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Day of month</span>
                <input
                  value={recurringForm.dayOfMonth}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      dayOfMonth: event.target.value,
                    })
                  }
                  className={inputClassName}
                  inputMode="numeric"
                />
              </label>
              <div className="space-y-1 text-sm md:col-span-2">
                <span>Category</span>
                <CategoryPicker
                  categories={dataset.categories}
                  value={recurringForm.categoryId}
                  inputClassName={inputClassName}
                  onChange={(categoryId) =>
                    setRecurringForm({
                      ...recurringForm,
                      categoryId,
                    })
                  }
                />
              </div>
              <label className="space-y-1 text-sm">
                <span>Account</span>
                <select
                  value={recurringForm.accountId}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      accountId: event.target.value,
                    })
                  }
                  className={inputClassName}
                >
                  <option value="">No account yet</option>
                  {dataset.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Starts</span>
                <input
                  type="date"
                  value={recurringForm.startedAt}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      startedAt: event.target.value,
                    })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={recurringForm.isActive}
                  onChange={(event) =>
                    setRecurringForm({
                      ...recurringForm,
                      isActive: event.target.checked,
                    })
                  }
                />
                Active
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span>Note</span>
              <textarea
                value={recurringForm.note}
                onChange={(event) =>
                  setRecurringForm({
                    ...recurringForm,
                    note: event.target.value,
                  })
                }
                className={textareaClassName}
              />
            </label>
            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecurringDialogOpen(false)}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit">
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activePaymentDebt?.direction === "receivable"
                ? "Collect debt"
                : "Pay debt"}
            </DialogTitle>
            <DialogDescription>
              This creates a normal wallet record linked to the debt.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handlePaymentSubmit}>
            <label className="space-y-1 text-sm">
              <span>Amount</span>
              <input
                value={paymentAmount}
                onChange={(event) =>
                  setPaymentAmount(limitDecimalPlaces(event.target.value))
                }
                className={inputClassName}
                inputMode="decimal"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Account</span>
              <select
                value={paymentAccountId}
                onChange={(event) => setPaymentAccountId(event.target.value)}
                className={inputClassName}
              >
                {dataset.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Date</span>
              <input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                className={inputClassName}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Note</span>
              <textarea
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                className={textareaClassName}
              />
            </label>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={saveAccountToDebt}
                onChange={(event) => setSaveAccountToDebt(event.target.checked)}
              />
              Save account on this debt
            </label>
            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentDialogOpen(false)}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit">
                <Banknote className="h-4 w-4" />
                Save payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
