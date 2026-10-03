import { z } from "zod";
import {
  currencySchema,
  paymentStatusSchema,
  paymentTypeSchema,
  recordTypeSchema,
  recordGoalAssociationSchema,
  uuidSchema,
} from "../../shared/schemas";
import { findExchangeRate } from "../../shared/money";
import type { WalletDataset, WalletRecord } from "../../shared/types";

export type ImportRecord = Omit<WalletRecord, "id">;
export interface CsvPreview {
  rowNumber: number;
  record?: ImportRecord;
  error?: string;
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const csv = text.replace(/^\uFEFF/, "");
  const endCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.length)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === ",") endCell();
    else if (c === "\r" || c === "\n") {
      endRow();
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (closed || c === '"')
      throw new Error("Invalid CSV quote placement.");
    else cell += c;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field.");
  if (cell || row.length || closed) endRow();
  const headers = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be unique.");
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(
        `CSV row ${i + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
  });
}

const csvCell = (value: unknown) => {
  const text =
    value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csvFields = [
  "occurredAt",
  "type",
  "amount",
  "currency",
  "accountId",
  "accountAmount",
  "destinationAccountId",
  "destinationAmount",
  "creditCardId",
  "categoryId",
  "counterpartyName",
  "paymentStatus",
  "paymentType",
  "exchangeRateToPrimary",
  "amountInLimitCurrency",
  "exchangeRateToLimitCurrency",
  "tagIds",
  "goalIds",
  "goalAssociations",
  "isFixed",
  "debtId",
  "note",
] as const;
export function recordsCsv(records: WalletRecord[]) {
  return [
    csvFields.join(","),
    ...records.map((record) =>
      csvFields
        .map((key) =>
          csvCell((record as unknown as Record<string, unknown>)[key]),
        )
        .join(","),
    ),
  ].join("\r\n");
}

function positive(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value?.trim()) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    throw new Error(`${label} must be a positive finite number.`);
  return number;
}
export function recordFingerprint(r: ImportRecord) {
  return JSON.stringify([
    r.type,
    r.currency,
    r.amount,
    r.accountId ?? "",
    r.destinationAccountId ?? "",
    r.creditCardId ?? "",
    r.occurredAt.slice(0, 10),
    (r.counterpartyName ?? "").trim().toLowerCase(),
    r.paymentStatus,
    r.debtId ?? "",
  ]);
}

export function prepareCsvRecords(
  csv: string,
  dataset: WalletDataset,
  defaultAccountId: string,
  expenseCategoryId: string,
  incomeCategoryId: string,
): CsvPreview[] {
  const seen = new Set(dataset.records.map(recordFingerprint));
  return parseCsv(csv).map((row, index) => {
    try {
      const type = recordTypeSchema.parse(row.type?.trim().toLowerCase());
      const amount = positive(row.amount, "Amount");
      if (!amount) throw new Error("Amount is required.");
      const rawDate = (row.date || row.occurredat || "").trim();
      const date = new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T12:00:00Z` : rawDate,
      );
      if (
        !rawDate ||
        Number.isNaN(date.getTime()) ||
        (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) &&
          date.toISOString().slice(0, 10) !== rawDate)
      )
        throw new Error("Date is invalid.");
      const paymentStatus = paymentStatusSchema.parse(
        row.paymentstatus || row.status || "cleared",
      );
      // Explicit empty IDs from an export are meaningful (for example review
      // items without a destination); defaults only fill absent CSV columns.
      const accountId =
        "accountid" in row ? row.accountid || undefined : defaultAccountId;
      const account = dataset.accounts.find((a) => a.id === accountId);
      const card = row.creditcardid
        ? dataset.creditCards.find((c) => c.id === row.creditcardid)
        : undefined;
      if (row.creditcardid && !card) throw new Error("Card does not exist.");
      if (
        (!account && !card && paymentStatus !== "needs_review") ||
        (accountId && !account)
      )
        throw new Error("Select a valid account.");
      const currency = currencySchema.parse(
        row.currency?.trim().toUpperCase() ||
          account?.currency ||
          card?.limitCurrency,
      );
      const occurredAt = date.toISOString();
      const primaryRate =
        positive(row.exchangeratetoprimary, "Primary exchange rate") ??
        findExchangeRate(
          dataset.exchangeRates,
          currency,
          dataset.settings.primaryCurrency,
          occurredAt,
        );
      if (!primaryRate)
        throw new Error(
          `Missing ${currency}/${dataset.settings.primaryCurrency} exchange rate. Supply exchangeRateToPrimary.`,
        );
      let accountAmount = positive(row.accountamount, "Account amount");
      if (
        account &&
        accountAmount === undefined &&
        currency !== account.currency
      ) {
        const rate =
          account.currency === dataset.settings.primaryCurrency
            ? primaryRate
            : findExchangeRate(
                dataset.exchangeRates,
                currency,
                account.currency,
                occurredAt,
              );
        if (!rate)
          throw new Error(
            `Missing ${currency}/${account.currency} exchange rate. Supply accountAmount.`,
          );
        accountAmount = Math.round(amount * rate * 100) / 100;
      }
      const categoryId =
        "categoryid" in row
          ? row.categoryid || undefined
          : dataset.categories.find(
              (c) =>
                c.name.toLowerCase() === row.category?.trim().toLowerCase(),
            )?.id || (type === "income" ? incomeCategoryId : expenseCategoryId);
      if (categoryId && !dataset.categories.some((c) => c.id === categoryId))
        throw new Error("Category does not exist.");
      const destination = row.destinationaccountid
        ? dataset.accounts.find((a) => a.id === row.destinationaccountid)
        : undefined;
      if (type === "transfer" && (!destination || destination.id === accountId))
        throw new Error("Transfer requires a different destination account.");
      const record: ImportRecord = {
        type,
        amount,
        currency,
        accountId,
        accountAmount,
        categoryId: categoryId || undefined,
        creditCardId: row.creditcardid || undefined,
        destinationAccountId: destination?.id,
        counterpartyName:
          row.description ||
          row.counterparty ||
          row.counterpartyname ||
          undefined,
        tagIds: row.tagids
          ? z.array(z.string()).parse(JSON.parse(row.tagids))
          : [],
        goalIds: row.goalids
          ? z.array(z.string()).parse(JSON.parse(row.goalids))
          : [],
        goalAssociations: row.goalassociations
          ? z
              .array(recordGoalAssociationSchema)
              .parse(JSON.parse(row.goalassociations))
          : [],
        paymentType: paymentTypeSchema.parse(row.paymenttype || "other"),
        paymentStatus,
        exchangeRateToPrimary: primaryRate,
        amountInLimitCurrency: positive(
          row.amountinlimitcurrency,
          "Limit amount",
        ),
        exchangeRateToLimitCurrency: positive(
          row.exchangeratetolimitcurrency,
          "Limit rate",
        ),
        occurredAt,
        note: row.note || undefined,
        isFixed: row.isfixed === "true",
        debtId: row.debtid ? uuidSchema.parse(row.debtid) : undefined,
      };
      if (
        record.debtId &&
        !dataset.debts.some((debt) => debt.id === record.debtId)
      )
        throw new Error("Linked debt does not exist.");
      if (destination) {
        const amountInDestination = positive(
          row.destinationamount,
          "Destination amount",
        );
        const rate =
          destination.currency === dataset.settings.primaryCurrency
            ? primaryRate
            : findExchangeRate(
                dataset.exchangeRates,
                currency,
                destination.currency,
                occurredAt,
              );
        if (!amountInDestination && !rate)
          throw new Error(
            "Missing destination exchange rate. Supply destinationAmount.",
          );
        Object.assign(record, {
          destinationAmount:
            amountInDestination ?? Math.round(amount * rate! * 100) / 100,
        });
      }
      const fingerprint = recordFingerprint(record);
      if (seen.has(fingerprint))
        throw new Error("Possible duplicate in wallet or CSV.");
      seen.add(fingerprint);
      return { rowNumber: index + 2, record };
    } catch (error) {
      return {
        rowNumber: index + 2,
        error: error instanceof Error ? error.message : "Invalid CSV row",
      };
    }
  });
}

export async function importRecordBatches(
  records: ImportRecord[],
  existing: WalletRecord[],
  send: (batch: ImportRecord[]) => Promise<WalletRecord[]>,
): Promise<number> {
  const seen = new Set(existing.map(recordFingerprint));
  const unique = records.filter((record) => {
    const key = recordFingerprint(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let confirmed = 0;
  for (let offset = 0; offset < unique.length; offset += 200) {
    try {
      confirmed += (await send(unique.slice(offset, offset + 200))).length;
    } catch (error) {
      throw new Error(
        `Confirmed imported ${confirmed} of ${unique.length} rows. The last batch may need reconciliation; refresh before retrying. ${error instanceof Error ? error.message : "Import failed"}`,
      );
    }
  }
  return confirmed;
}
