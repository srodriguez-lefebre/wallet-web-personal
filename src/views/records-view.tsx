import { FormEvent, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney, groupRecordsByDay } from "@shared/calculations";
import type { CurrencyCode, PaymentStatus, PaymentType, RecordType } from "@shared/types";

export function RecordsView() {
  const { dataset, selectedMonth, addRecord, deleteRecord } = useWallet();
  const [type, setType] = useState<RecordType>("expense");
  const [accountId, setAccountId] = useState(dataset.accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState(
    dataset.accounts[1]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState(dataset.categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tagId, setTagId] = useState("");
  const [filterType, setFilterType] = useState<"all" | RecordType>("all");
  const [search, setSearch] = useState("");

  const categories = dataset.categories.filter((category) =>
    type === "income" ? category.type === "income" : category.type === "expense",
  );

  const filteredRecords = useMemo(() => {
    return dataset.records
      .filter((record) => record.occurredAt.startsWith(selectedMonth))
      .filter((record) => (filterType === "all" ? true : record.type === filterType))
      .filter((record) => {
        const category = dataset.categories.find((item) => item.id === record.categoryId);
        const counterparty = dataset.counterparties.find(
          (item) => item.id === record.counterpartyId,
        );
        const haystack = `${category?.name ?? ""} ${counterparty?.name ?? ""} ${record.note ?? ""}`;
        return haystack.toLowerCase().includes(search.toLowerCase());
      })
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
  }, [dataset, filterType, search, selectedMonth]);

  const grouped = groupRecordsByDay(filteredRecords);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return;

    const account = dataset.accounts.find((item) => item.id === accountId);

    addRecord({
      type,
      amount: numericAmount,
      currency: (account?.currency ?? "UYU") as CurrencyCode,
      accountId,
      destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId,
      counterpartyId: undefined,
      tagIds: tagId ? [tagId] : [],
      paymentType: type === "transfer" ? "transfer" : ("cash" as PaymentType),
      paymentStatus: "cleared" as PaymentStatus,
      exchangeRateToPrimary: account?.currency === "USD" ? 39.2 : 1,
      occurredAt: new Date().toISOString(),
      note: note || undefined,
    });
    setAmount("");
    setNote("");
    setTagId("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Registros"
        description="Gastos, ingresos, transferencias, filtros y formulario de carga."
      />

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nuevo registro</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-3 gap-2 rounded-md bg-secondary p-1">
                  {(["expense", "income", "transfer"] as RecordType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setType(item)}
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

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Monto</span>
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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

                {type === "transfer" ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Cuenta destino</span>
                    <select
                      value={destinationAccountId}
                      onChange={(event) => setDestinationAccountId(event.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Etiqueta</span>
                  <select
                    value={tagId}
                    onChange={(event) => setTagId(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                  <span className="text-sm font-medium">Nota</span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Descripcion opcional"
                  />
                </label>

                <Button className="w-full" type="submit">
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                value={filterType}
                onChange={(event) => setFilterType(event.target.value as "all" | RecordType)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Todos</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
                <option value="transfer">Transferencias</option>
              </select>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Buscar por nota, categoria..."
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{filteredRecords.length} registros</CardTitle>
              <Badge variant="muted">{selectedMonth}</Badge>
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

                    return (
                      <div
                        key={record.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
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
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {account?.name} · {record.note ?? "Sin nota"}
                          </p>
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
                            onClick={() => deleteRecord(record.id)}
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
