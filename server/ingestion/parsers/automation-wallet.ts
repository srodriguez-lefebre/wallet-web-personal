import { parseAmount, parseBankCurrency } from "../../../shared/mail-normalization.js";
import { messageBody, messageMatchesAutomationWallet } from "./message.js";

import type { MailMessage, NormalizedTransaction } from "./types.js";
export function parse(message: MailMessage): NormalizedTransaction | null {
  const body = messageBody(message);
  if (!messageMatchesAutomationWallet(body)) return null;
  const result = parseMatch(message, body);
  if (!Number.isFinite(result.date.getTime())) throw new Error("Fecha bancaria inválida.");
  return result;
}
function parseMatch(message: MailMessage, body: string): NormalizedTransaction {
  const alias = body.match(/Tarjeta\s*\/\s*Pase\s*:\s*([^\n|]+)/i);
  const merchant = body.match(/Nombre\s*\/\s*Contraparte\s*:\s*([^\n|]+)/i);
  const amount = body.match(/Monto\s*:\s*(?:([A-Z]{3})\s*)?\$?\s*([0-9][0-9.,]*)/i);
  if (!alias || !merchant || !amount) throw new Error("Consumo Automation Wallet incompleto.");
  return {
    source: "automation_wallet",
    sourceLabel: "Auto Wallet",
    paymentType: "credit_card",
    amount: parseAmount(amount[2]!),
    currency: parseBankCurrency(amount[1]! || "UYU"),
    merchant: merchant[1]!.trim(),
    cardAlias: alias[1]!.trim(),
    cardBrand: "",
    cardNumber: "",
    date: new Date(message.date),
  };
}
