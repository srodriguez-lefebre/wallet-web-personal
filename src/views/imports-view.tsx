import { type FormEvent, useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { useNavigate } from "react-router-dom";
import { DataHealthPanel } from "@/components/wallet/data-health-panel";
import {
  backupFilename,
  readBackupReceipt,
  rememberBackupExport,
  summarizeCsvPreview,
} from "@/lib/data-health";
import { ActionToast } from "@/components/ui/action-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";
import { useActionToast } from "@/lib/use-action-toast";
import { prepareCsvRecords, recordsCsv } from "@/lib/record-import";
import { formatMoney, recordsForDateRange } from "@shared/calculations";
import { walletBackupSchema } from "@shared/wallet-backup-schema";
import type { WalletDataset } from "@shared/types";

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const sample =
  "date,description,amount,type,currency\n2026-06-15,Coffee,180,expense,UYU";

export function ImportsView() {
  const navigate = useNavigate();
  const {
    dataset,
    importRecords,
    getCompleteDataset,
    getBackupDataset,
    restoreBackup,
    selectedDateRange,
    selectedPeriodMode,
    isAllHistoryComplete,
    clearRecordFilters,
    setRecordFilters,
    setAllPeriod,
  } = useWallet();
  const { toast, runAction } = useActionToast();
  const [csv, setCsv] = useState(sample);
  const [accountId, setAccountId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [incomeId, setIncomeId] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [receipt, setReceipt] = useState(readBackupReceipt);
  const [message, setMessage] = useState("");
  const [backup, setBackup] = useState<WalletDataset | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const activeAccountId =
    accountId || dataset.accounts.find((a) => a.isActive)?.id || "";
  const expenseCategoryId = expenseId || dataset.categories[0]?.id || "";
  const incomeCategoryId =
    incomeId ||
    dataset.categories.find((c) => c.name.toLowerCase() === "income")?.id ||
    expenseCategoryId;
  const preview = useMemo(() => {
    try {
      return {
        rows: prepareCsvRecords(
          csv,
          dataset,
          activeAccountId,
          expenseCategoryId,
          incomeCategoryId,
        ),
        error: "",
      };
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : "Invalid CSV",
      };
    }
  }, [csv, dataset, activeAccountId, expenseCategoryId, incomeCategoryId]);
  const previewSummary = summarizeCsvPreview(preview.rows);
  function openRecords(review = false) {
    clearRecordFilters();
    setAllPeriod();
    if (review) setRecordFilters({ paymentStatus: "needs_review" });
    navigate("/records");
  }

  async function action(work: () => Promise<void>, label: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await runAction(
        async () => {
          try {
            await work();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Operation failed",
            );
            throw error;
          }
        },
        {
          processing: `${label}...`,
          success: `${label} complete`,
          error: `${label} failed`,
        },
      );
    } catch {
      /* Feedback is retained in the toast and message. */
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function exportData(format: "json" | "csv" | "period") {
    await action(async () => {
      const complete =
        format === "json"
          ? await getBackupDataset()
          : await getCompleteDataset();
      if (format === "json") {
        const requestedAt = new Date();
        downloadText(
          backupFilename(requestedAt),
          JSON.stringify(complete, null, 2),
          "application/json",
        );
        setReceipt(rememberBackupExport(complete, requestedAt));
      } else {
        const records =
          format === "period" && selectedPeriodMode !== "all"
            ? recordsForDateRange(complete.records, selectedDateRange)
            : complete.records;
        downloadText(
          format === "period"
            ? `wallet-records-${selectedDateRange.from}-${selectedDateRange.to}.csv`
            : "wallet-records.csv",
          recordsCsv(records),
          "text/csv;charset=utf-8",
        );
      }
    }, "Export");
  }

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const complete = await getCompleteDataset();
      const rows = prepareCsvRecords(
        csv,
        complete,
        activeAccountId,
        expenseCategoryId,
        incomeCategoryId,
      );
      const records = rows.flatMap((row) => (row.record ? [row.record] : []));
      if (!records.length)
        throw new Error(
          "No valid new rows to import after checking complete history.",
        );
      const count = await importRecords(records);
      setMessage(
        `Imported ${count} rows. ${rows.length - records.length} invalid or duplicate rows skipped. Each batch of up to 200 rows commits atomically.`,
      );
    }, "Import");
  }

  async function loadBackup(file?: File) {
    setBackup(null);
    setConfirmed(false);
    if (!file) return;
    await action(async () => {
      const parsed = walletBackupSchema.parse(JSON.parse(await file.text()));
      setBackup(parsed as WalletDataset);
      setMessage(
        "Backup validated. Review its contents and confirm replacement below.",
      );
    }, "Validate backup");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Data"
        title="Import / Export"
        description="Backups and exports load complete history before creating the file."
      >
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void exportData("json")}
        >
          <Download className="h-4 w-4" />
          JSON backup
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void exportData("csv")}
        >
          Records CSV
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void exportData("period")}
        >
          Selected period CSV
        </Button>
      </PageHeader>
      <p className="mb-4 text-sm text-muted-foreground">
        {receipt
          ? `Last JSON export requested: ${new Date(receipt.requestedAt).toLocaleString("es-UY")} · ${receipt.records} records · ${receipt.cardRecords} card records. Verify the downloaded file before relying on it.`
          : "No JSON export recorded in this browser."}
      </p>
      <DataHealthPanel
        getSnapshot={getBackupDataset}
        onReview={() => openRecords(true)}
        onRecords={() => openRecords()}
        onCards={() => navigate("/cards")}
      />
      {!isAllHistoryComplete ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Complete history will be fetched before import, export, or duplicate
          checking.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {message}
        </p>
      ) : null}
      <form
        className="grid gap-4 xl:grid-cols-2"
        onSubmit={(event) => void handleImport(event)}
      >
        <Card>
          <CardHeader>
            <CardTitle>CSV input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block">
              CSV file
              <input
                disabled={busy}
                type="file"
                accept=".csv,text/csv"
                className="block w-full"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    void action(
                      async () => setCsv(await file.text()),
                      "Load CSV",
                    );
                }}
              />
            </label>
            <label className="block">
              Default account
              <select
                disabled={busy}
                className="block w-full rounded border bg-background p-2"
                value={activeAccountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {dataset.accounts
                  .filter((a) => a.isActive)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              Default expense category
              <select
                disabled={busy}
                className="block w-full rounded border bg-background p-2"
                value={expenseCategoryId}
                onChange={(event) => setExpenseId(event.target.value)}
              >
                {dataset.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Default income category
              <select
                disabled={busy}
                className="block w-full rounded border bg-background p-2"
                value={incomeCategoryId}
                onChange={(event) => setIncomeId(event.target.value)}
              >
                {dataset.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              CSV currency, exchangeRateToPrimary and accountAmount are
              preserved. Supply missing conversion values when no historical
              rate is available. Exported account/category IDs override
              defaults.
            </p>
            <textarea
              aria-label="CSV records"
              disabled={busy}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              className="min-h-72 w-full rounded-md border bg-background p-3 font-mono text-sm"
            />
            {preview.error ? <p role="alert">{preview.error}</p> : null}
            <Button
              disabled={busy || !preview.rows.some((row) => row.record)}
              type="submit"
            >
              <Upload className="h-4 w-4" />
              {busy ? "Working..." : "Import valid rows"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm">
              {previewSummary.ready} ready · {previewSummary.skipped} invalid or
              duplicate rows
              {!isAllHistoryComplete
                ? " (preliminary until complete history is checked)"
                : ""}
            </p>
            {previewSummary.totals.map((total) => (
              <p
                key={total.currency}
                className="mb-2 text-sm text-muted-foreground"
              >
                {total.currency}: income{" "}
                {formatMoney(total.income, total.currency)} · expenses{" "}
                {formatMoney(total.expenses, total.currency)} · transfers{" "}
                {formatMoney(total.transfers, total.currency)}
              </p>
            ))}
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr className="border-t" key={row.rowNumber}>
                      <td className="p-2">{row.rowNumber}</td>
                      <td>{row.record?.occurredAt.slice(0, 10)}</td>
                      <td>
                        {row.record?.amount} {row.record?.currency}
                      </td>
                      <td>{row.error || "Ready"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </form>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Restore JSON backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            Restoring replaces wallet data with this backup in one transaction.
            Export a current backup first if you want to keep your changes.
          </p>
          <label className="block">
            Backup file
            <input
              disabled={busy}
              className="block"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void loadBackup(event.target.files?.[0])}
            />
          </label>
          {backup ? (
            <>
              <p>
                {backup.accounts.length} accounts · {backup.records.length}{" "}
                records · {backup.creditCardRecords.length} card records ·{" "}
                {backup.goals.length} goals
              </p>
              <label className="flex gap-2">
                <input
                  disabled={busy}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Replace the current wallet with this backup.
              </label>
              <Button
                disabled={busy || !confirmed}
                onClick={() =>
                  void action(async () => {
                    await restoreBackup(backup);
                    setBackup(null);
                    setConfirmed(false);
                    setMessage(
                      "Backup restored and canonical wallet reloaded.",
                    );
                  }, "Restore backup")
                }
              >
                Restore confirmed backup
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      <ActionToast toast={toast} />
    </div>
  );
}
