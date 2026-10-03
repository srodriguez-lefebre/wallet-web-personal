import { FormEvent, useRef, useState } from "react";
import {
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
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import { limitDecimalPlaces } from "@/lib/utils";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney } from "@shared/calculations";
import { investmentTypeLabels } from "@shared/constants";
import { summarizeInvestmentsByCurrency } from "@shared/planning";
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

const investmentTypeOptions: Array<{
  value: Investment["type"];
  label: string;
}> = [
  { value: "fund", label: investmentTypeLabels.fund },
  { value: "stock", label: investmentTypeLabels.stock },
  { value: "crypto", label: investmentTypeLabels.crypto },
  { value: "deposit", label: investmentTypeLabels.deposit },
  { value: "other", label: investmentTypeLabels.other },
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
  const {
    dataset,
    addInvestment,
    updateInvestment,
    deleteInvestment,
    addInstallmentPlan,
    updateInstallmentPlan,
    deleteInstallmentPlan,
  } = useWallet();
  const [showHidden, setShowHidden] = useState(false);
  const { toast, runAction } = useActionToast();
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [investmentDrafts, setInvestmentDrafts] = useState<InvestmentDraft[]>(
    () => buildInvestmentDrafts(dataset.investments),
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<Investment["type"]>("fund");
  const [amountInvested, setAmountInvested] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("UYU");
  const [startedAt, setStartedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isVisible, setIsVisible] = useState(true);
  const [note, setNote] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [installmentName, setInstallmentName] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  const visibleInvestments = dataset.investments.filter(
    (investment) => showHidden || investment.isVisible,
  );
  const portfolio = summarizeInvestmentsByCurrency(visibleInvestments);

  async function handleAddInstallment(event: FormEvent) {
    event.preventDefault();
    const account =
      dataset.accounts.find((item) => item.isActive) ?? dataset.accounts[0];
    const category = dataset.categories[0];
    const totalAmount = Number(installmentAmount);
    const installmentsTotal = Number(installmentCount);
    if (
      !account ||
      !category ||
      !installmentName.trim() ||
      totalAmount <= 0 ||
      installmentsTotal <= 0
    )
      return;
    await addInstallmentPlan({
      name: installmentName.trim(),
      totalAmount,
      currency: account.currency,
      installmentsTotal,
      installmentsPaid: 0,
      accountId: account.id,
      categoryId: category.id,
    });
    setInstallmentName("");
    setInstallmentAmount("");
    setInstallmentCount("");
  }
  const visibleInvestmentDrafts = investmentDrafts.filter(
    (draft) => !draft.isDeleted && (showHidden || draft.isVisible),
  );
  const shouldShowInvestmentsPanel = isEditing
    ? visibleInvestmentDrafts.length > 0
    : visibleInvestments.length > 0;
  const inputClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  const textareaClassName =
    "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  function startEditingInvestments() {
    setInvestmentDrafts(buildInvestmentDrafts(dataset.investments));
    setShowHidden(false);
    setEditError("");
    setIsEditing(true);
  }

  function cancelEditingInvestments() {
    setInvestmentDrafts(buildInvestmentDrafts(dataset.investments));
    setShowHidden(false);
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

  async function saveInvestmentEdits() {
    if (saving.current) return;
    const activeDrafts = investmentDrafts.filter((draft) => !draft.isDeleted);
    const invalidDraft = activeDrafts.find(
      (draft) =>
        !draft.name.trim() ||
        Number(draft.amountInvested) <= 0 ||
        !draft.currentValue.trim() ||
        !Number.isFinite(Number(draft.amountInvested)) ||
        !Number.isFinite(Number(draft.currentValue)) ||
        Number(draft.currentValue) < 0,
    );

    if (invalidDraft) {
      setEditError(
        "Review name, invested amount, and current value for each investment.",
      );
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      await runAction(
        async () => {
          await Promise.all(
            investmentDrafts
              .filter((draft) => draft.isDeleted)
              .map((draft) => deleteInvestment(draft.id)),
          );

          await Promise.all(
            activeDrafts.map((draft) =>
              updateInvestment(draft.id, {
                name: draft.name.trim(),
                type: draft.type,
                amountInvested: Number(draft.amountInvested),
                currentValue: Number(draft.currentValue),
                currency: draft.currency,
                startedAt: draft.startedAt,
                isVisible: draft.isVisible,
                note: draft.note.trim() || undefined,
              }),
            ),
          );
        },
        {
          processing: "Saving investments...",
          success: "Investments saved",
          error: "Could not save investments",
        },
      );
      setShowHidden(false);
      setEditError("");
      setIsEditing(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Could not save investments.",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function handleCreateInvestment(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const invested = Number(amountInvested);
    const current = Number(currentValue || amountInvested);
    if (
      !name.trim() ||
      !Number.isFinite(invested) ||
      !Number.isFinite(current) ||
      invested <= 0 ||
      current < 0
    ) {
      setEditError(
        "Enter a name, positive acquisition cost, and current value of zero or more.",
      );
      return;
    }

    saving.current = true;
    setIsSaving(true);
    setEditError("");
    try {
      const id = await runAction(
        () =>
          addInvestment({
            name: name.trim(),
            type,
            amountInvested: invested,
            currentValue: current,
            currency,
            startedAt,
            isVisible,
            note: note || undefined,
          }),
        {
          processing: "Creating investment...",
          success: "Investment created",
          error: "Could not create investment",
        },
      );

      setName("");
      setAmountInvested("");
      setCurrentValue("");
      setStartedAt(new Date().toISOString().slice(0, 10));
      setIsVisible(true);
      setNote("");
      setIsCreateOpen(false);
      navigate(`/investments/${id}`);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Could not create investment.",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <div>
      <ActionToast toast={toast} />
      <PageHeader
        eyebrow="Investments"
        title="Investments"
        description="Create manual investments and open details to review performance and context."
      >
        {isEditing ? (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label={
                showHidden
                  ? "Hide hidden investments"
                  : "Show hidden investments"
              }
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={cancelEditingInvestments}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button disabled={isSaving} onClick={saveInvestmentEdits}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="outline"
              aria-label="Edit investments"
              disabled={dataset.investments.length === 0}
              onClick={startEditingInvestments}
            >
              <Edit3 className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label={
                showHidden
                  ? "Hide hidden investments"
                  : "Show hidden investments"
              }
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </Button>
            <Dialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                if (!saving.current) {
                  setEditError("");
                  setIsCreateOpen(open);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="icon" aria-label="New investment">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New investment</DialogTitle>
                  <DialogDescription>
                    Add a manual investment to track current value and
                    performance.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreateInvestment}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                      placeholder="Fondo, accion, deposito..."
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Type</span>
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
                      <span className="text-sm font-medium">Invested</span>
                      <input
                        value={amountInvested}
                        onChange={(event) =>
                          setAmountInvested(
                            limitDecimalPlaces(event.target.value),
                          )
                        }
                        type="number"
                        className={inputClassName}
                        placeholder="10000"
                        step="0.01"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Current value</span>
                      <input
                        value={currentValue}
                        onChange={(event) =>
                          setCurrentValue(event.target.value)
                        }
                        type="number"
                        className={inputClassName}
                        placeholder="Opcional"
                        min="0"
                        step="0.01"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">Start date</span>
                      <input
                        value={startedAt}
                        onChange={(event) => setStartedAt(event.target.value)}
                        type="date"
                        className={inputClassName}
                      />
                    </label>
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
                  {editError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {editError}
                    </p>
                  ) : null}
                  <Button className="w-full" type="submit" disabled={isSaving}>
                    <Plus className="h-4 w-4" />
                    Crear y abrir detalle
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </PageHeader>

      {!isEditing && portfolio.length > 0 ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {portfolio.map((summary) => (
            <Card
              key={summary.currency}
              aria-label={`${summary.currency} portfolio summary`}
            >
              <CardHeader>
                <CardTitle>{summary.currency} portfolio</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {summary.count} investments ·{" "}
                  {showHidden ? "including hidden" : "visible only"}
                </p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span>Invested</span>
                  <span className="font-semibold">
                    {formatMoney(summary.invested, summary.currency)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Current value</span>
                  <span className="font-semibold">
                    {formatMoney(summary.currentValue, summary.currency)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Result</span>
                  <span
                    className={
                      summary.gain >= 0
                        ? "font-semibold text-emerald-600"
                        : "font-semibold text-red-600"
                    }
                  >
                    {formatMoney(summary.gain, summary.currency)}
                    {summary.returnPercentage === null
                      ? " · Unavailable"
                      : ` · ${summary.returnPercentage.toFixed(2)}%`}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        {shouldShowInvestmentsPanel ? (
          <Card className={isEditing ? "xl:col-span-2" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Investments
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
                          <span className="text-sm font-medium">Name</span>
                          <input
                            value={draft.name}
                            onChange={(event) =>
                              updateInvestmentDraft(draft.id, {
                                name: event.target.value,
                              })
                            }
                            className={inputClassName}
                            placeholder="Name"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={
                              draft.isVisible
                                ? "Hide investment"
                                : "Show investment"
                            }
                            title={
                              draft.isVisible
                                ? "Hide investment"
                                : "Show investment"
                            }
                            onClick={() =>
                              updateInvestmentDraft(draft.id, {
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
                            aria-label="Delete investment"
                            title="Delete investment"
                            onClick={() => markInvestmentForDeletion(draft.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">Type</span>
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
                          <span className="text-sm font-medium">Currency</span>
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
                          <span className="text-sm font-medium">Invested</span>
                          <input
                            value={draft.amountInvested}
                            onChange={(event) =>
                              updateInvestmentDraft(draft.id, {
                                amountInvested: limitDecimalPlaces(
                                  event.target.value,
                                ),
                              })
                            }
                            type="number"
                            className={inputClassName}
                            step="0.01"
                          />
                        </label>
                        <label className="block space-y-2">
                          <span className="text-sm font-medium">
                            Current value
                          </span>
                          <input
                            value={draft.currentValue}
                            min="0"
                            onChange={(event) =>
                              updateInvestmentDraft(draft.id, {
                                currentValue: event.target.value,
                              })
                            }
                            type="number"
                            className={inputClassName}
                            step="0.01"
                          />
                        </label>
                      </div>
                      <label className="mt-3 block space-y-2">
                        <span className="text-sm font-medium">Start date</span>
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
                      <label className="mt-3 block space-y-2">
                        <span className="text-sm font-medium">Note</span>
                        <textarea
                          value={draft.note}
                          onChange={(event) =>
                            updateInvestmentDraft(draft.id, {
                              note: event.target.value,
                            })
                          }
                          className={textareaClassName}
                          placeholder="Optional context"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                visibleInvestments.map((investment) => {
                  const gain =
                    investment.currentValue - investment.amountInvested;
                  const percentage =
                    investment.amountInvested > 0
                      ? (investment.currentValue / investment.amountInvested) *
                        100
                      : 0;
                  return (
                    <button
                      key={investment.id}
                      type="button"
                      onClick={() => navigate(`/investments/${investment.id}`)}
                      className="w-full rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
                    >
                      <div>
                        <p className="font-medium">{investment.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {investmentTypeLabels[investment.type]}
                        </p>
                      </div>
                      <Progress
                        value={Math.min(100, percentage)}
                        className="mt-3"
                        indicatorClassName={
                          gain >= 0 ? "bg-emerald-500" : "bg-red-500"
                        }
                      />
                      <div className="mt-3 flex justify-between text-sm">
                        <span>Current</span>
                        <span className="font-semibold">
                          {formatMoney(
                            investment.currentValue,
                            investment.currency,
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm">
                        <span>Result</span>
                        <span
                          className={
                            gain >= 0 ? "text-emerald-600" : "text-red-600"
                          }
                        >
                          {formatMoney(gain, investment.currency)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4" />
              Installments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2 sm:grid-cols-[1fr_120px_100px_auto]"
              onSubmit={handleAddInstallment}
            >
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={installmentName}
                onChange={(event) => setInstallmentName(event.target.value)}
                placeholder="Installment plan"
              />
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={installmentAmount}
                onChange={(event) => setInstallmentAmount(event.target.value)}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Total"
              />
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={installmentCount}
                onChange={(event) => setInstallmentCount(event.target.value)}
                type="number"
                min="1"
                step="1"
                placeholder="Count"
              />
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </form>
            {dataset.installmentPlans.map((plan) => {
              const percentage =
                (plan.installmentsPaid / plan.installmentsTotal) * 100;
              return (
                <div key={plan.id} className="rounded-md border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">{plan.name}</p>
                    <p className="font-semibold">
                      {plan.installmentsPaid}/{plan.installmentsTotal}
                    </p>
                  </div>
                  <Progress value={percentage} className="mt-3" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Total {formatMoney(plan.totalAmount, plan.currency)}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          plan.installmentsPaid >= plan.installmentsTotal
                        }
                        onClick={() =>
                          void updateInstallmentPlan(plan.id, {
                            ...plan,
                            installmentsPaid: plan.installmentsPaid + 1,
                          })
                        }
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={`Delete ${plan.name}`}
                        onClick={() => void deleteInstallmentPlan(plan.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
