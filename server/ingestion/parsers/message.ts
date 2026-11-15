import {
  normalizeText,
  htmlToText,
  normalizeCardAlias,
} from "../../../shared/mail-normalization.js";

import type { MailMessage } from "./types.js";
export function messageBody(message: MailMessage) {
  return normalizeText(message.plainBody || htmlToText(message.htmlBody));
}
export function messageMatchesItau(message: MailMessage) {
  const from = String(message.from || "").trim();
  const address = from.match(/<([^<>]+)>\s*$/);
  if ((address ? address[1]!.trim() : from).toLowerCase() !== "comunicaciones@itau.com.uy")
    return null;
  const subject = normalizeCardAlias(message.subject);
  if (subject.includes("AVISO DE CONSUMO APROBADO CON TARJETA DE CREDITO")) return "credit_card";
  if (subject.includes("AVISO DE CONSUMO APROBADO CON TARJETA DE DEBITO")) return "debit";
  if (subject.includes("TRANSFERENCIA REALIZADA")) return "transfer";
  if (subject === "PAGO REALIZADO") return "payment";
  return null;
}
export function messageMatchesAutomationWallet(body: string) {
  return (
    /Tarjeta\s*\/\s*Pase\s*:/i.test(body) &&
    /Nombre\s*\/\s*Contraparte\s*:/i.test(body) &&
    /Monto\s*:/i.test(body)
  );
}
