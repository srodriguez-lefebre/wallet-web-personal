import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";
import { dateRangeForMonth, recordsForDateRange } from "@shared/calculations";
import type { PaymentStatus, PaymentType, RecordType, WalletRecord } from "@shared/types";

type CsvRow = Record<string, string>;

interface PreviewRow {
  rowNumber: number;
  raw: CsvRow;
  type: RecordType | null;
  amount: number;
  occurredAt: string;
  description: string;
  categoryId?: string;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  note?: string;
  error?: string;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

const sampleCsv =
  "date,description,amount,type,category\n2026-06-15,Coffee,180,expense,Food & Drinks\n2026-06-16,Sale,2500,income,Income";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      isQuoted = !isQuoted;
    } else if (character === "," && !isQuoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(csv: string) {
  const [headerLine, ...rowLines] = csv.trim().split(/\r?\n/).filter(Boolean);
  const columns = parseCsvLine(headerLine ?? "").map((column) =>
    column.trim().toLowerCase(),
  );

  return rowLines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index] ?? ""]),
    ) as CsvRow;
  });
}

function normalizeRecordType(value: string): RecordType | null {
  const cleanValue = value.trim().toLowerCase();
  if (cleanValue === "expense" || cleanValue === "income") return cleanValue;
  return null;
}

function normalizePaymentType(value: string | undefined): PaymentType {
  const cleanValue = value?.trim().toLowerCase();
  if (
    cleanValue === "cash" ||
    cleanValue === "debit" ||
    cleanValue === "credit" ||
    cleanValue === "transfer" ||
    cleanValue === "other"
  ) {
    return cleanValue;
  }
  return "other";
}

function normalizePaymentStatus(value: string | undefined): PaymentStatus {
  const cleanValue = value?.trim().toLowerCase();
  if (cleanValue === "pending" || cleanValue === "cancelled") return cleanValue;
  return "cleared";
}

function toIsoDate(value: string) {
  const cleanValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return `${cleanValue}T12:00:00.000Z`;
  }

  const date = new Date(cleanValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function findCategoryId(
  categories: ReturnType<typeof useWallet>["dataset"]["categories"],
  categoryName: string,
) {
  const cleanName = categoryName.trim().toLowerCase();
  if (!cleanName) return undefined;
  return categories.find((category) => category.name.toLowerCase() === cleanName)?.id;
}

export function ImportsView() {
  const {
    dataset,
    importRecords,
    selectedMonth,
    selectedPeriodMode,
    selectedDateRange,
  } = useWallet();
  const [csv, setCsv] = useState(sampleCsv);
  const [accountId, setAccountId] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const selectedAccount =
    dataset.accounts.find((account) => account.id === accountId) ?? dataset.accounts[0];
  const activeAccountId = selectedAccount?.id ?? "";
  const activeExpenseCategoryId =
    expenseCategoryId ||
    dataset.categories.find((category) => category.name.toLowerCase() !== "income")
      ?.id ||
    "";
  const activeIncomeCategoryId =
    incomeCategoryId ||
    dataset.categories.find((category) => category.name.toLowerCase() === "income")
      ?.id ||
    activeExpenseCategoryId;

  const preview = useMemo<PreviewRow[]>(() => {
    return parseCsv(csv).map((row, index) => {
      const type = normalizeRecordType(row.type ?? "");
      const amount = Number(row.amount);
      const occurredAt = toIsoDate(row.date ?? row.occurredat ?? "");
      const description = row.description ?? row.counterparty ?? "";
      const categoryId =
        findCategoryId(dataset.categories, row.category ?? "") ??
        (type === "income" ? activeIncomeCategoryId : activeExpenseCategoryId);
      const duplicate = dataset.records.some((record) =>
        record.type === type && record.amount === amount &&
        record.occurredAt.slice(0, 10) === occurredAt.slice(0, 10) &&
        (record.counterpartyName ?? "").trim().toLowerCase() === description.trim().toLowerCase(),
      );
      const error =
        !type
          ? "Type must be expense or income."
          : !amount || amount <= 0
            ? "Amount must be greater than zero."
            : !occurredAt
              ? "Date is invalid."
              : !activeAccountId
                ? "Select an account."
                : !categoryId
                  ? "Select a default category."
                  : duplicate
                    ? "Possible duplicate already in wallet."
                  : undefined;

      return {
        rowNumber: index + 2,
        raw: row,
        type,
        amount,
        occurredAt,
        description,
        categoryId,
        paymentType: normalizePaymentType(row.paymenttype),
        paymentStatus: normalizePaymentStatus(row.paymentstatus ?? row.status),
        note: row.note,
        error,
      };
    });
  }, [
    activeAccountId,
    activeExpenseCategoryId,
    activeIncomeCategoryId,
    csv,
    dataset.categories,
    dataset.records,
  ]);

  const validRows = preview.filter((row) => !row.error && row.type);
  const invalidRows = preview.filter((row) => row.error);

  function exportJson() {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "wallet-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportRecords(rows = dataset.records, filename = "wallet-records.csv") {
    const headers = ["date", "type", "amount", "currency", "counterparty", "status", "paymentType", "note"];
    const lines = rows.map((record) => [record.occurredAt, record.type, record.amount, record.currency, record.counterpartyName, record.paymentStatus, record.paymentType, record.note].map(csvCell).join(","));
    downloadText(filename, [headers.join(","), ...lines].join("\n"));
  }

  function exportSelectedPeriod() {
    const range =
      selectedPeriodMode === "month"
        ? dateRangeForMonth(selectedMonth)
        : selectedDateRange;
    exportRecords(
      recordsForDateRange(dataset.records, range),
      `wallet-records-${range.from}-${range.to}.csv`,
    );
  }

  async function loadCsvFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setImportMessage("");
  }

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    if (!selectedAccount || validRows.length === 0) return;

    setIsImporting(true);
    setImportMessage("");
    try {
      const records: Array<Omit<WalletRecord, "id">> = validRows.map((row) => ({
          type: row.type ?? "expense",
          amount: row.amount,
          currency: selectedAccount.currency,
          accountId: selectedAccount.id,
          categoryId: row.categoryId,
          counterpartyName: row.description.trim() || undefined,
          tagIds: [],
          paymentType: row.paymentType,
          paymentStatus: row.paymentStatus,
          exchangeRateToPrimary: selectedAccount.currency === "USD" ? 39.2 : 1,
          occurredAt: row.occurredAt,
          note: row.note?.trim() || undefined,
        }));
      const imported = await importRecords(records);
      setImportMessage(`Imported ${imported} rows atomically.`);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Data"
        title="Import / Export"
        description="Import validated CSV records or export a backup and reports for the selected period."
      >
        <Button variant="outline" onClick={exportJson}>
          <Download className="h-4 w-4" />
          JSON backup
        </Button>
        <Button variant="outline" onClick={() => exportRecords()}><Download className="h-4 w-4" />Records CSV</Button>
        <Button variant="outline" onClick={exportSelectedPeriod}><Download className="h-4 w-4" />Selected period CSV</Button>
      </PageHeader>

      <form className="grid gap-4 xl:grid-cols-[420px_1fr]" onSubmit={handleImport}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              CSV input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">CSV file</span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => void loadCsvFile(event.target.files?.[0])} className="block w-full text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Account</span>
                <select
                  value={activeAccountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {dataset.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Default expense category</span>
                <select
                  value={activeExpenseCategoryId}
                  onChange={(event) => setExpenseCategoryId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {dataset.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Default income category</span>
                <select
                  value={activeIncomeCategoryId}
                  onChange={(event) => setIncomeCategoryId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {dataset.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={csv}
              onChange={(event) => {
                setCsv(event.target.value);
                setImportMessage("");
              }}
              className="min-h-72 w-full rounded-md border bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={validRows.length > 0 ? "success" : "muted"}>
                {validRows.length} valid
              </Badge>
              <Badge variant={invalidRows.length > 0 ? "danger" : "muted"}>
                {invalidRows.length} invalid
              </Badge>
            </div>
            <Button
              className="w-full"
              type="submit"
              disabled={isImporting || validRows.length === 0}
            >
              <Upload className="h-4 w-4" />
              {isImporting ? "Importing..." : "Import valid rows"}
            </Button>
            {importMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                {importMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-secondary text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => {
                    const category = dataset.categories.find(
                      (item) => item.id === row.categoryId,
                    );

                    return (
                      <tr key={row.rowNumber} className="border-t">
                        <td className="px-3 py-2">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          {row.occurredAt ? row.occurredAt.slice(0, 10) : "-"}
                        </td>
                        <td className="px-3 py-2">{row.description || "-"}</td>
                        <td className="px-3 py-2">{row.type ?? "-"}</td>
                        <td className="px-3 py-2">{row.amount || "-"}</td>
                        <td className="px-3 py-2">{category?.name ?? "-"}</td>
                        <td className="px-3 py-2">
                          {row.error ? (
                            <Badge variant="danger">{row.error}</Badge>
                          ) : (
                            <Badge variant="success">Ready</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
