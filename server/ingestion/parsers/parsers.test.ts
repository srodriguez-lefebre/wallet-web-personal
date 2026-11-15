import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { beforeAll, expect, test } from "vitest";

import { parseEmail } from "./index";
import { parse as parseCredit } from "./itau-credit";
import { parse as parseDebit } from "./itau-debit";
import { parse as parseTransfer } from "./itau-transfer";
import { parse as parsePayment } from "./itau-payment";
import { parse as parseAutomation } from "./automation-wallet";

import type { MailMessage, NormalizedTransaction } from "./types";

const date = "2026-11-14T15:00:00.000Z";
const cases = [
  {
    parse: parseCredit,
    source: "itau_credit_card",
    paymentType: "credit_card",
    amount: 1234.56,
    currency: "USD",
    subject: "Aviso de consumo aprobado con tarjeta de crédito",
    body: "Importe: *1.234,56* *USD*\nComercio: *SYNTHETIC*SHOP*\nVISA nro. ****1234",
  },
  {
    parse: parseDebit,
    source: "itau_debit_card",
    paymentType: "debit",
    amount: 250,
    currency: "UYU",
    subject: "Aviso de consumo aprobado con tarjeta de débito",
    body: "Se aprobó un consumo de su tarjeta VISA terminada en 2468\nRealizado en SYNTHETIC SHOP\nMonto: 250 Pesos",
  },
  {
    parse: parseTransfer,
    source: "itau_transfer",
    paymentType: "transfer",
    amount: 1000,
    currency: "UYU",
    subject: "Transferencia realizada",
    body: "Transferencia realizada desde la cuenta *****1357*\nImporte: *URGP 1.000,00*\nCuenta destino: *9876540*\nBanco / Institución destino: *Banco Synthetic*",
  },
  {
    parse: parsePayment,
    source: "itau_payment",
    paymentType: "transfer",
    amount: 45.5,
    currency: "USD",
    subject: "Pago realizado",
    body: "Tu pago fue realizado con éxito\nCuenta origen terminada en ...1357.\nMonto: USD 45,50\nPago a SYNTHETIC SERVICE.",
  },
  {
    parse: parseAutomation,
    source: "automation_wallet",
    paymentType: "credit_card",
    amount: 80,
    currency: "UYU",
    subject: "Synthetic custom message",
    body: "Tarjeta / Pase: TEST CARD\nNombre / Contraparte: SYNTHETIC STORE\nMonto: UYU $ 80",
  },
] as const;

function message(item: (typeof cases)[number]): MailMessage {
  return {
    from: "Synthetic bank <comunicaciones@itau.com.uy>",
    subject: item.subject,
    date,
    plainBody: item.body,
  };
}
let gs: { parseEmail: typeof parseEmail };
beforeAll(() => {
  const context = createContext({});
  runInContext(
    readFileSync(new URL("../../../mail-service/normalization.gs", import.meta.url), "utf8"),
    context,
  );
  gs = context.WalletMail as typeof gs;
});

test.each(cases)("$source has identical TS and generated V8 parsing", (item) => {
  const input = message(item);
  const parsed = item.parse(input)!;
  expect(parsed).toMatchObject({
    source: item.source,
    paymentType: item.paymentType,
    amount: item.amount,
    currency: item.currency,
  });
  expect(parsed.date.toISOString()).toBe(date);
  expect(JSON.parse(JSON.stringify(gs.parseEmail(input)))).toEqual(
    JSON.parse(JSON.stringify(parseEmail(input))),
  );
  if (item.source === "itau_credit_card") expect(parsed.merchant).toBe("SYNTHETIC*SHOP");
});

test("recognition uses the exact sender and disabled processors retain their old flags", () => {
  expect(
    parseEmail({ ...message(cases[0]), from: "comunicaciones@itau.com.uy.attacker.example" }),
  ).toBeNull();
  expect(parseCredit(message(cases[1]))).toBeNull();
  expect(
    parseEmail(message(cases[0]), { itau_process: false, Automation_wallet: true }),
  ).toBeNull();
  expect(
    parseEmail(message(cases[4]), { itau_process: true, Automation_wallet: false }),
  ).toBeNull();
});

test("recognized malformed amounts stay pending through a parser error", () => {
  expect(() =>
    parseEmail({
      ...message(cases[1]),
      plainBody: cases[1].body.replace("250 Pesos", "1,23,45 Pesos"),
    }),
  ).toThrow();
});

test("equal amounts on different dates preserve both original timestamps", () => {
  const first = parseEmail(message(cases[4])) as NormalizedTransaction;
  const second = parseEmail({ ...message(cases[4]), date: "2026-12-14T15:00:00.000Z" })!;
  expect(first.amount).toBe(second.amount);
  expect(first.date.toISOString()).not.toBe(second.date.toISOString());
});
