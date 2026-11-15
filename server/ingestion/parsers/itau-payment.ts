import { parseAmount, parseBankCurrency } from "../../../shared/mail-normalization.js";
import { messageBody, messageMatchesItau } from "./message.js";

import type { MailMessage, NormalizedTransaction } from "./types.js";
export function parse(message: MailMessage): NormalizedTransaction | null {
  if (messageMatchesItau(message) !== "payment") return null;
  const body = messageBody(message);

  const result = parseMatch(message, body);
  if (!Number.isFinite(result.date.getTime())) throw new Error("Fecha bancaria inválida.");
  return result;
}
function parseMatch(message: MailMessage, body: string): NormalizedTransaction {
  const confirmed = /Tu\s+pago\s+fue\s+realizado\s+con\s+[eé]xito\b/i.test(body);
  const originLine = body.match(/(?:^|\n)Cuenta\s+origen\s+terminada\s+en\s+([^\n]+)/i);
  const origin =
    originLine &&
    originLine[1]!
      .replace(/\*/g, "")
      .trim()
      .match(/^(?:\.{3}|…)?\s*(\d{4})\.?$/);
  const amountLine = body.match(/(?:^|\n)Monto\s*:\s*([^\n]+)/i);
  const payeeLine = body.match(/(?:^|\n)Pago\s+a\s+([^\n]+)/i);
  const payee =
    payeeLine &&
    payeeLine[1]!
      .trim()
      .replace(/\.$/, "")
      .replace(/^\*([\s\S]+)\*$/, "$1")
      .replace(/\.$/, "")
      .trim();
  if (!confirmed || !origin || !amountLine || !payee)
    throw new Error("Aviso de pago Itaú incompleto.");
  const amountText = amountLine[1]!.replace(/\*/g, "").trim().replace(/\.$/, "");
  const amount = amountText.match(/^(?:([A-Z]{3}|\$)\s*)?([0-9][0-9.,]*)(?:\s*([A-Z]{3}|\$))?$/i);
  if (
    !amount ||
    !(amount[1]! || amount[3]!) ||
    (amount[1]! && amount[3]! && parseBankCurrency(amount[1]) !== parseBankCurrency(amount[3]))
  ) {
    throw new Error("Importe o moneda de pago Itaú inválidos.");
  }
  return {
    source: "itau_payment",
    sourceLabel: "Auto Itaú",
    paymentType: "transfer",
    amount: parseAmount(amount[2]!),
    currency: parseBankCurrency(amount[1]! || amount[3]!),
    merchant: payee,
    accountNumber: `****${origin[1]!}`,
    cardBrand: "",
    cardNumber: "",
    cardAlias: "",
    date: new Date(message.date),
  };
}
