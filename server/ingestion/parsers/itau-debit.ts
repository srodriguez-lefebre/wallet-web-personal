import { parseAmount, parseBankCurrency } from "../../../shared/mail-normalization.js";
import { messageBody, messageMatchesItau } from "./message.js";

import type { MailMessage, NormalizedTransaction } from "./types.js";
export function parse(message: MailMessage): NormalizedTransaction | null {
  if (messageMatchesItau(message) !== "debit") return null;
  const body = messageBody(message);

  const result = parseMatch(message, body);
  if (!Number.isFinite(result.date.getTime())) throw new Error("Fecha bancaria inválida.");
  return result;
}
function parseMatch(message: MailMessage, body: string): NormalizedTransaction {
  const approved = /Se\s+aprob[oó]\s+un\s+consumo\s+de\s+su\s+tarjeta/i.test(body);
  const card = body.match(/tarjeta\s+(VISA|MASTER(?:CARD)?|AMEX)\s+terminada\s+en\s+(\d{4})\b/i);
  const merchant = body.match(/Realizado\s+en\s+([\s\S]+?)\s+Monto\s*:/i);
  const amount = body.match(/Monto\s*:\s*([0-9][0-9.,]*)\s+(D[oó]lares|Pesos|USD|UYU)\b/i);
  if (!approved || !card || !merchant || !amount)
    throw new Error("Aviso de débito Itaú incompleto.");
  return {
    source: "itau_debit_card",
    sourceLabel: "Auto Itaú",
    paymentType: "debit",
    amount: parseAmount(amount[1]!),
    currency: parseBankCurrency(amount[2]!),
    merchant: merchant[1]!.replace(/\s+/g, " ").trim(),
    cardBrand: card[1]!.toUpperCase(),
    cardNumber: `****${card[2]!}`,
    cardAlias: "",
    date: new Date(message.date),
  };
}
