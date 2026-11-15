import {
  parseAmount,
  parseBankCurrency,
  trimTrailingFormatAsterisk,
} from "../../../shared/mail-normalization.js";
import { messageBody, messageMatchesItau } from "./message.js";

import type { MailMessage, NormalizedTransaction } from "./types.js";
export function parse(message: MailMessage): NormalizedTransaction | null {
  if (messageMatchesItau(message) !== "credit_card") return null;
  const body = messageBody(message);

  const result = parseMatch(message, body);
  if (!Number.isFinite(result.date.getTime())) throw new Error("Fecha bancaria inválida.");
  return result;
}
function parseMatch(message: MailMessage, body: string): NormalizedTransaction {
  const amount = body.match(/Importe\s*:?\s*\*?\s*([0-9][0-9.,]*)\s*\*?\s*\*?\s*([A-Z]{3})/i);
  const merchant = body.match(/Comercio\s*:?\s*\*?\s*([^\n]+)/i);
  const card = body.match(/(VISA|MASTER(?:CARD)?|AMEX)[\s\S]{0,100}?nro\.?\s*([*\d]+)/i);
  if (!amount || !merchant || !trimTrailingFormatAsterisk(merchant[1]!))
    throw new Error("Aviso de crédito Itaú incompleto.");
  return {
    source: "itau_credit_card",
    sourceLabel: "Auto Itaú",
    paymentType: "credit_card",
    amount: parseAmount(amount[1]!),
    currency: parseBankCurrency(amount[2]!),
    merchant: trimTrailingFormatAsterisk(merchant[1]!),
    cardBrand: card ? card[1]!.toUpperCase() : "",
    cardNumber: card ? card[2]! : "",
    cardAlias: "",
    date: new Date(message.date),
  };
}
