import { FormEvent, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Edit3, FilterX, Plus, Save, Trash2, X } from "lucide-react";
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
} from "@/components/ui/dialog";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney, groupRecordsByDay } from "@shared/calculations";
import type {
  CurrencyCode,
  PaymentStatus,
  PaymentType,
  RecordType,
  WalletRecord,
} from "@shared/types";

function firstCategoryIdForType(
  categories: ReturnType<typeof useWallet>["dataset"]["categories"],
  type: RecordType,
) {
  const categoryType = type === "income" ? "income" : "expense";
  return categories.find((category) => category.type === categoryType)?.id ?? "";
}

export function RecordsView() {
  const {
    dataset,
    selectedMonth,
    recordFilters,
    setRecordFilters,
    clearRecordFilters,
    addRecord,
    updateRecord,
    deleteRecord,
  } = useWallet();

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<RecordType>("expense");
  const [accountId, setAccountId] = useState(dataset.accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState(
    dataset.accounts[1]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState(
    firstCategoryIdForType(dataset.categories, "expense"),
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tagId, setTagId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("cleared");
  const categories = dataset.categories.filter((category) =>
    type === "income" ? category.type === "income" : category.type === "expense",
  );
  const fieldClassName =
    "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  const filteredRecords = useMemo(() => {
    return dataset.records
      .filter((record) => record.occurredAt.startsWith(selectedMonth))
      .filter((record) =>
        !recordFilters.type || recordFilters.type === "all"
          ? true
          : record.type === recordFilters.type,
      )
      .filter((record) =>
        recordFilters.accountId ? record.accountId === recordFilters.accountId : true,
      )
      .filter((record) =>
        recordFilters.categoryId ? record.categoryId === recordFilters.categoryId : true,
      )
      .filter((record) =>
        recordFilters.tagId ? record.tagIds.includes(recordFilters.tagId) : true,
      )
      .filter((record) =>
        recordFilters.counterpartyId
          ? record.counterpartyId === recordFilters.counterpartyId
          : true,
      )
      .filter((record) => {
        const category = dataset.categories.find((item) => item.id === record.categoryId);
        const counterparty = dataset.counterparties.find(
          (item) => item.id === record.counterpartyId,
        );
        const tags = record.tagIds
          .map((id) => dataset.tags.find((tag) => tag.id === id)?.name ?? "")
          .join(" ");
        const haystack = `${category?.name ?? ""} ${counterparty?.name ?? ""} ${tags} ${record.note ?? ""}`;
        return haystack.toLowerCase().includes((recordFilters.search ?? "").toLowerCase());
      })
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
  }, [dataset, recordFilters, selectedMonth]);

  const grouped = groupRecordsByDay(filteredRecords);
  const activeFilters = [
    recordFilters.type && recordFilters.type !== "all" ? recordFilters.type : null,
    recordFilters.accountId
      ? dataset.accounts.find((account) => account.id === recordFilters.accountId)?.name
      : null,
    recordFilters.categoryId
      ? dataset.categories.find((category) => category.id === recordFilters.categoryId)?.name
      : null,
    recordFilters.tagId
      ? dataset.tags.find((tag) => tag.id === recordFilters.tagId)?.name
      : null,
    recordFilters.counterpartyId
      ? dataset.counterparties.find(
          (counterparty) => counterparty.id === recordFilters.counterpartyId,
        )?.name
      : null,
    recordFilters.search,
  ].filter(Boolean);

  function resetForm(nextType: RecordType = "expense") {
    setEditingId(null);
    setType(nextType);
    setAccountId(dataset.accounts[0]?.id ?? "");
    setDestinationAccountId(dataset.accounts[1]?.id ?? "");
    setCategoryId(firstCategoryIdForType(dataset.categories, nextType));
    setAmount("");
    setNote("");
    setTagId("");
    setCounterpartyId("");
    setPaymentType(nextType === "transfer" ? "transfer" : "cash");
    setPaymentStatus("cleared");
  }

  function openNewRecordDialog() {
    resetForm();
    setIsRecordDialogOpen(true);
  }

  function loadRecord(record: WalletRecord) {
    setEditingId(record.id);
    setType(record.type);
    setAccountId(record.accountId);
    setDestinationAccountId(record.destinationAccountId ?? "");
    setCategoryId(record.categoryId ?? firstCategoryIdForType(dataset.categories, record.type));
    setAmount(String(record.amount));
    setNote(record.note ?? "");
    setTagId(record.tagIds[0] ?? "");
    setCounterpartyId(record.counterpartyId ?? "");
    setPaymentType(record.paymentType);
    setPaymentStatus(record.paymentStatus);
    setIsRecordDialogOpen(true);
  }

  function closeRecordDialog() {
    setIsRecordDialogOpen(false);
    resetForm(type);
  }

  function buildRecord(): Omit<WalletRecord, "id"> | null {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return null;

    const account = dataset.accounts.find((item) => item.id === accountId);

    return {
      type,
      amount: numericAmount,
      currency: (account?.currency ?? "UYU") as CurrencyCode,
      accountId,
      destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      counterpartyId: counterpartyId || undefined,
      tagIds: tagId ? [tagId] : [],
      paymentType,
      paymentStatus,
      exchangeRateToPrimary: account?.currency === "USD" ? 39.2 : 1,
      occurredAt: editingId
        ? (dataset.records.find((record) => record.id === editingId)?.occurredAt ??
          new Date().toISOString())
        : new Date().toISOString(),
      note: note || undefined,
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextRecord = buildRecord();
    if (!nextRecord) return;

    if (editingId) {
      updateRecord(editingId, nextRecord);
    } else {
      addRecord(nextRecord);
    }

    closeRecordDialog();
  }

  function handleDeleteEditingRecord() {
    if (!editingId) return;
    deleteRecord(editingId);
    closeRecordDialog();
  }

  function updateSearch(value: string) {
    setRecordFilters({ search: value });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Registros"
        description="Toca cualquier movimiento para editar monto, cuenta, contraparte, estado o notas."
      >
        <Button onClick={openNewRecordDialog}>
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </PageHeader>

      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Editar registro" : "Nuevo registro"}
            </DialogTitle>
            <DialogDescription>
              Ajusta tipo, monto, cuenta, categoria, etiquetas y estado del movimiento.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary p-1">
              {(["expense", "income", "transfer"] as RecordType[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setType(item);
                    setCategoryId(firstCategoryIdForType(dataset.categories, item));
                    setPaymentType(item === "transfer" ? "transfer" : paymentType);
                  }}
                  className={
                    type === item
                      ? "rounded bg-card px-2 py-2 text-sm font-medium shadow-sm"
                      : "rounded px-2 py-2 text-sm text-muted-foreground"
                  }
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Monto</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={fieldClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Cuenta</span>
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className={fieldClassName}
                >
                  {dataset.accounts
                    .filter((account) => account.isActive)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {type === "transfer" ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium">Cuenta destino</span>
                <select
                  value={destinationAccountId}
                  onChange={(event) => setDestinationAccountId(event.target.value)}
                  className={fieldClassName}
                >
                  {dataset.accounts
                    .filter((account) => account.isActive && account.id !== accountId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-2">
                <span className="text-sm font-medium">Categoria</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={fieldClassName}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Etiqueta</span>
                <select
                  value={tagId}
                  onChange={(event) => setTagId(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Sin etiqueta</option>
                  {dataset.tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Contraparte</span>
                <select
                  value={counterpartyId}
                  onChange={(event) => setCounterpartyId(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Sin contraparte</option>
                  {dataset.counterparties.map((counterparty) => (
                    <option key={counterparty.id} value={counterparty.id}>
                      {counterparty.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Tipo de pago</span>
                <select
                  value={paymentType}
                  onChange={(event) => setPaymentType(event.target.value as PaymentType)}
                  className={fieldClassName}
                >
                  <option value="cash">cash</option>
                  <option value="debit">debit</option>
                  <option value="credit">credit</option>
                  <option value="transfer">transfer</option>
                  <option value="other">other</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Estado</span>
                <select
                  value={paymentStatus}
                  onChange={(event) =>
                    setPaymentStatus(event.target.value as PaymentStatus)
                  }
                  className={fieldClassName}
                >
                  <option value="cleared">cleared</option>
                  <option value="pending">pending</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Nota</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={fieldClassName}
                placeholder="Descripcion opcional"
              />
            </label>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {editingId ? (
                <Button type="button" variant="destructive" onClick={handleDeleteEditingRecord}>
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={closeRecordDialog}>
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              )}
              <Button type="submit">
                {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? "Guardar cambios" : "Agregar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <input
              value={recordFilters.search ?? ""}
              onChange={(event) => updateSearch(event.target.value)}
              className={fieldClassName}
              placeholder="Buscar..."
            />
            <select
              value={recordFilters.type ?? "all"}
              onChange={(event) =>
                setRecordFilters({ type: event.target.value as "all" | RecordType })
              }
              className={fieldClassName}
            >
              <option value="all">Todos</option>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
              <option value="transfer">Transferencias</option>
            </select>
            <select
              value={recordFilters.accountId ?? ""}
              onChange={(event) =>
                setRecordFilters({ accountId: event.target.value || undefined })
              }
              className={fieldClassName}
            >
              <option value="">Cuentas</option>
              {dataset.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <select
              value={recordFilters.categoryId ?? ""}
              onChange={(event) =>
                setRecordFilters({ categoryId: event.target.value || undefined })
              }
              className={fieldClassName}
            >
              <option value="">Categorias</option>
              {dataset.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={recordFilters.counterpartyId ?? ""}
              onChange={(event) =>
                setRecordFilters({ counterpartyId: event.target.value || undefined })
              }
              className={fieldClassName}
            >
              <option value="">Contrapartes</option>
              {dataset.counterparties.map((counterparty) => (
                <option key={counterparty.id} value={counterparty.id}>
                  {counterparty.name}
                </option>
              ))}
            </select>
            <Button className="w-full" variant="outline" onClick={clearRecordFilters}>
              <FilterX className="h-4 w-4" />
              Reset
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{filteredRecords.length} registros</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="muted">{selectedMonth}</Badge>
                {activeFilters.map((filter) => (
                  <Badge key={String(filter)} variant="info">
                    {filter}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {Object.entries(grouped).map(([day, records]) => (
              <div key={day}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <p className="font-semibold">{format(parseISO(day), "dd/MM/yyyy")}</p>
                  <p className="text-muted-foreground">{records.length} movimientos</p>
                </div>
                <div className="space-y-2">
                  {records.map((record) => {
                    const category = dataset.categories.find(
                      (item) => item.id === record.categoryId,
                    );
                    const account = dataset.accounts.find(
                      (item) => item.id === record.accountId,
                    );
                    const counterparty = dataset.counterparties.find(
                      (item) => item.id === record.counterpartyId,
                    );
                    const tags = record.tagIds
                      .map((id) => dataset.tags.find((tag) => tag.id === id))
                      .filter(Boolean);

                    return (
                      <div
                        key={record.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => loadRecord(record)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            loadRecord(record);
                          }
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition hover:border-primary/50 hover:bg-secondary"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{
                                backgroundColor: category?.color ?? "#0EA5E9",
                              }}
                            />
                            <p className="font-medium">
                              {category?.name ?? "Transferencia"}
                            </p>
                            <Badge
                              variant={
                                record.type === "expense"
                                  ? "danger"
                                  : record.type === "income"
                                    ? "success"
                                    : "info"
                              }
                            >
                              {record.type}
                            </Badge>
                            <Badge variant="muted">{record.paymentStatus}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {account?.name}
                            {counterparty ? ` · ${counterparty.name}` : " · Sin contraparte"}
                            {record.note ? ` · ${record.note}` : " · Sin nota"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {tags.map((tag) =>
                              tag ? (
                                <Badge key={tag.id} variant="info">
                                  {tag.name}
                                </Badge>
                              ) : null,
                            )}
                            <Badge variant="muted">{record.paymentType}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p
                            className={
                              record.type === "expense"
                                ? "font-semibold text-red-600"
                                : record.type === "income"
                                  ? "font-semibold text-emerald-600"
                                  : "font-semibold text-sky-600"
                            }
                          >
                            {record.type === "expense"
                              ? "-"
                              : record.type === "income"
                                ? "+"
                                : ""}
                            {formatMoney(record.amount, record.currency)}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteRecord(record.id);
                            }}
                            aria-label="Eliminar registro"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
