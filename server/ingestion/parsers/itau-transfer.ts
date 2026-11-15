import { parseAmount, parseBankCurrency } from "../../../shared/mail-normalization.js";
import { messageBody, messageMatchesItau } from "./message.js";

import type { MailMessage, NormalizedTransaction } from "./types.js";
export function parse(message: MailMessage): NormalizedTransaction | null {
  if (messageMatchesItau(message) !== "transfer") return null;
  const body = messageBody(message);

  const result = parseMatch(message, body);
  if (!Number.isFinite(result.date.getTime())) throw new Error("Fecha bancaria inválida.");
  return result;
}
function parseMatch(message: MailMessage, body: string): NormalizedTransaction {
  const origin = body.match(
    /Transferencia\s+realizada\s+desde\s+la\s+cuenta\s+\*?(\*{4}\d{4})\b\*?/i,
  );
  const amountLine = body.match(/(?:^|\n)Importe\s*:\s*([^\n]+)/i);
  const destination = body.match(/(?:^|\n)Cuenta destino\s*:\s*\*?(\d+)\*?\s*(?:\n|$)/i);
  const bank = body.match(/(?:^|\n)Banco\s*\/\s*Instituci[oó]n destino\s*:\s*([^\n]+)/i);
  if (!origin || !amountLine || !destination || !bank || !bank[1]!.trim())
    throw new Error("Aviso de transferencia Itaú incompleto.");
  const amountText = amountLine[1]!
    .trim()
    .replace(/^\*([^*\n]+)\*$/, "$1")
    .replace(/\*([0-9][0-9.,]*|URGP|[A-Z]{3}|\$)\*/gi, "$1");
  const amount = amountText.match(
    /^(?:(URGP|[A-Z]{3}|\$)\s*)?([0-9][0-9.,]*)(?:\s*(URGP|[A-Z]{3}|\$))?$/i,
  );
  if (
    !amount ||
    !(amount[1]! || amount[3]!) ||
    (amount[1]! && amount[3]! && parseBankCurrency(amount[1]) !== parseBankCurrency(amount[3]))
  ) {
    throw new Error("Importe o moneda de transferencia Itaú inválidos.");
  }
  const destinationBank = bank[1]!
    .trim()
    .replace(/^\*([^\n]+)\*$/, "$1")
    .trim();
  return {
    source: "itau_transfer",
    sourceLabel: "Auto Itaú",
    paymentType: "transfer",
    amount: parseAmount(amount[2]!),
    currency: parseBankCurrency(amount[1]! || amount[3]!),
    merchant: `Transferencia a ${destinationBank} ****${destination[1]!.slice(-4)}`,
    accountNumber: origin[1]!,
    destinationAccountNumber: destination[1]!,
    destinationBank,
    cardBrand: "",
    cardNumber: "",
    cardAlias: "",
    date: new Date(message.date),
  };
}
