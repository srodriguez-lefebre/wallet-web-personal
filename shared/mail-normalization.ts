import type { CurrencyCode } from "./types.js";
export const mailSources = [
  "itau_credit_card",
  "itau_debit_card",
  "itau_transfer",
  "itau_payment",
  "automation_wallet",
  "generic",
] as const;
export type MailSource = (typeof mailSources)[number];
export type MailIngestionPayload = import("zod").infer<
  typeof import("./schemas.js").mailIngestionSchema
>;
export const bankCurrencies = {
  UYU: "UYU",
  USD: "USD",
  EUR: "EUR",
  BRL: "BRL",
  ARS: "ARS",
  DOLARES: "USD",
  PESOS: "UYU",
  URGP: "UYU",
  $: "UYU",
} as const satisfies Record<string, CurrencyCode>;
export function parseBankCurrency(raw: unknown): CurrencyCode {
  const key = normalizeCardAlias(raw);
  if (Object.prototype.hasOwnProperty.call(bankCurrencies, key))
    return bankCurrencies[key as keyof typeof bankCurrencies];
  throw new Error("Moneda bancaria no reconocida.");
}
export function normalizeMerchantTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cardLastFour(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

export function merchantTokenSequenceMatch(merchantRaw: string, aliasRaw: string) {
  const merchantTokens = normalizeMerchantTerm(merchantRaw).split(" ").filter(Boolean);
  const aliasTokens = normalizeMerchantTerm(aliasRaw).split(" ").filter(Boolean);
  if (aliasTokens.length === 0 || aliasTokens.length > merchantTokens.length) return false;

  return merchantTokens.some((_, index) =>
    aliasTokens.every((aliasToken, offset) => merchantTokens[index + offset] === aliasToken),
  );
}

export function pickLongestMerchantMatch<T extends { normalizedAlias: string; priority: number }>(
  merchantRaw: string,
  candidates: T[],
) {
  return candidates
    .filter((candidate) => merchantTokenSequenceMatch(merchantRaw, candidate.normalizedAlias))
    .sort(
      (a, b) =>
        b.normalizedAlias.length - a.normalizedAlias.length ||
        b.priority - a.priority ||
        a.normalizedAlias.localeCompare(b.normalizedAlias),
    )[0];
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value || "")
    : "";
}

export function normalizeCardAlias(value: unknown) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function normalizeText(value: unknown) {
  return textValue(value)
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function htmlToText(html: unknown) {
  return textValue(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

export function trimTrailingFormatAsterisk(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("*") ? trimmed.slice(0, -1).trim() : trimmed;
}

export function parseAmount(raw: string) {
  let value = raw.trim().replace(/\s/g, "");
  const comma = value.lastIndexOf(","),
    dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const boundary = value.lastIndexOf(decimal);
    const whole = value.slice(0, boundary),
      fraction = value.slice(boundary + 1);
    const grouped = decimal === "," ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    if (!grouped.test(whole) || !/^\d{1,2}$/.test(fraction))
      throw new Error(`Importe inválido: ${raw}`);
    value = whole.replace(/[.,]/g, "") + "." + fraction;
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const parts = value.split(separator);
    const grouped =
      /^\d{1,3}$/.test(parts[0]!) && parts.slice(1).every((part) => /^\d{3}$/.test(part));
    const decimal = parts.length === 2 && /^\d+$/.test(parts[0]!) && /^\d{1,2}$/.test(parts[1]!);
    if (!grouped && !decimal) throw new Error(`Importe inválido: ${raw}`);
    value = grouped ? parts.join("") : parts.join(".");
  } else if (!/^\d+$/.test(value)) {
    throw new Error(`Importe inválido: ${raw}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error(`No pude convertir el importe: ${raw}`);
  return number;
}
