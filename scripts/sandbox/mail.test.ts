import { expect, test } from "vitest";
import {
  runMailAutomation,
  type MailRunInput,
  type SimulatedMessage,
} from "./mail.js";

const credit: SimulatedMessage = {
  id: "message-test",
  from: "comunicaciones@itau.com.uy",
  subject: "Aviso de consumo aprobado con tarjeta de crédito",
  date: "2026-10-02T12:00:00.000Z",
  isRead: false,
  body: "Importe: 1.234,56 UYU\nComercio: TEST MARKET\nVISA nro. ****1234",
};
const debit: SimulatedMessage = {
  ...credit,
  subject: "Aviso de consumo aprobado con tarjeta de debito",
  body: "Se aprobo un consumo de su tarjeta Visa terminada en 2468 . Realizado en TEST *SUBSCRIPTION Monto: 95.84 Dolares. Si no fuiste tú comunícate al 1784.",
};
const transfer: SimulatedMessage = {
  ...credit,
  subject: "Transferencia realizada",
  body: "Transferencia realizada desde la cuenta ****1357\nImporte: 44.00 USD\nCuenta destino: 9876540\nBanco/Institución destino: Banco Itau",
};
const ignored: SimulatedMessage = {
  ...credit,
  id: "ignored",
  subject: "Newsletter",
  body: "News only",
};
const input: MailRunInput = {
  now: "2026-10-03T12:00:00.000Z",
  ingestUrl: "http://127.0.0.1:4173/api/ingest/mail/transactions",
  ingestToken: "test-only",
  targets: { cards: { "1234": { creditCardId: "card-test" } } },
  threads: [
    { id: "thread-test", labels: ["Wallet/Pendiente"], messages: [credit] },
  ],
};
const ok = () => ({ status: 201, body: '{"data":{"status":"created"}}' });
function mail(...messages: SimulatedMessage[]): MailRunInput {
  const value = structuredClone(input);
  value.threads[0].messages = structuredClone(messages);
  return value;
}

test("actual Apps Script builds credit payload and marks the completed message read", () => {
  const result = runMailAutomation(input, ok);
  expect(result.deliveries[0].payload).toMatchObject({
    idempotencyKey: "gmail:itau_credit_card:message-test",
    transaction: {
      amount: 1234.56,
      currency: "UYU",
      merchantRaw: "TEST MARKET",
      paymentType: "credit_card",
    },
    destination: { creditCardId: "card-test" },
  });
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
  expect(result.threads[0].messages[0].isRead).toBe(true);
  expect(input.threads[0].messages[0].isRead).toBe(false);
});

test("unsupported mail completes and is read without an ingestion request", () => {
  const result = runMailAutomation(mail(ignored), ok);
  expect(result.deliveries).toEqual([]);
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
  expect(result.threads[0].messages[0].isRead).toBe(true);
});

test.each(["Aviso de devolución", "Pago de tarjeta recibido"])(
  "unsupported %s completes without fabricating a purchase",
  (subject) => {
    const result = runMailAutomation(mail({ ...credit, subject }), ok);
    expect(result.deliveries).toEqual([]);
    expect(result.threads[0].messages[0].isRead).toBe(true);
    expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
  },
);

test.each([
  "comunicaciones@itau.com.uy.evil.test",
  "evilcomunicaciones@itau.com.uy",
  '"comunicaciones@itau.com.uy" <attacker@example.test>',
])("does not ingest misleading sender %s", (from) => {
  const result = runMailAutomation(mail({ ...credit, from }), ok);
  expect(result.deliveries).toEqual([]);
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
});

test("display-name sender and accent-free credit subject are recognized", () => {
  const result = runMailAutomation(
    mail({
      ...credit,
      from: "Itaú <comunicaciones@itau.com.uy>",
      subject: "Aviso de consumo aprobado con tarjeta de credito",
    }),
    ok,
  );
  expect(result.deliveries[0].payload).toMatchObject({
    transaction: { paymentType: "credit_card" },
  });
});

test.each(["1.234,56", "1,234.56", "1234.56", "1234,56", "1.234", "1,234"])(
  "parses bank amount %s without losing thousands",
  (raw) => {
    const result = runMailAutomation(
      mail({
        ...credit,
        body: `Importe: ${raw} UYU\nComercio: TEST MARKET\nVISA nro. ****1234`,
      }),
      ok,
    );
    expect(result.deliveries[0].payload).toMatchObject({
      transaction: {
        amount: raw === "1.234" || raw === "1,234" ? 1234 : 1234.56,
      },
    });
  },
);

test.each([credit, debit, transfer])(
  "malformed recognized $subject remains unread and pending",
  (message) => {
    const result = runMailAutomation(
      mail({ ...message, body: "Financial fields missing" }),
      ok,
    );
    expect(result.deliveries).toEqual([]);
    expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
    expect(result.threads[0].messages[0].isRead).toBe(false);
    expect(result.logs.some((log) => log.includes("queda pendiente"))).toBe(
      true,
    );
  },
);

test.each([
  ["Dolares", "USD"],
  ["Dólares", "USD"],
  ["Pesos", "UYU"],
])("debit %s consumes only its mapped bank account", (word, currency) => {
  const value = mail({ ...debit, body: debit.body.replace("Dolares", word) });
  value.targets = {
    defaultAccountId: "must-not-guess",
    cards: { "2468": { creditCardId: "must-not-credit" } },
    debitCards: {
      "2468": { accountId: "fallback" },
      [`2468:${currency}`]: { accountId: "currency-account" },
    },
  };
  const result = runMailAutomation(value, ok);
  expect(result.deliveries[0].payload).toMatchObject({
    idempotencyKey: "gmail:itau_debit_card:message-test",
    transaction: {
      paymentType: "debit",
      amount: 95.84,
      currency,
      cardNumber: "****2468",
      cardBrand: "VISA",
      merchantRaw: "TEST *SUBSCRIPTION",
    },
    destination: { accountId: "currency-account" },
  });
  expect(
    (result.deliveries[0].payload as { destination: unknown }).destination,
  ).toEqual({ accountId: "currency-account" });
});

test("unmapped debit never falls back to a credit card or default account", () => {
  const value = mail(debit);
  value.targets = {
    cards: {
      "2468": { creditCardId: "must-not-credit", accountId: "must-not-use" },
    },
    defaultAccountId: "must-not-guess",
  };
  const result = runMailAutomation(value, ok);
  expect(result.deliveries[0].payload).toMatchObject({
    transaction: { paymentType: "debit" },
  });
  expect(
    (result.deliveries[0].payload as { destination: unknown }).destination,
  ).toEqual({});
});

test("reference-only debit mapping remains supported", () => {
  const value = mail(debit);
  value.targets.debitCards = { "2468": { accountId: "fallback" } };
  expect(runMailAutomation(value, ok).deliveries[0].payload).toMatchObject({
    destination: { accountId: "fallback" },
  });
});

test.each([
  ["44.00 USD", 44, "USD"],
  ["1.234,56 UYU", 1234.56, "UYU"],
  ["$ 44,00", 44, "UYU"],
  ["44,00 $", 44, "UYU"],
])(
  "outgoing transfer %s carries explicit bank mappings and a masked description",
  (raw, amount, currency) => {
    const value = mail({
      ...transfer,
      body: transfer.body.replace("44.00 USD", String(raw)),
    });
    value.targets.bankAccounts = {
      "1357": { accountId: "source-fallback" },
      [`1357:${currency}`]: { accountId: "source-currency" },
      "ITAU:9876540": { accountId: "destination-fallback" },
      [`ITAU:9876540:${currency}`]: { accountId: "destination-currency" },
    };
    const result = runMailAutomation(value, ok);
    expect(result.deliveries[0].payload).toMatchObject({
      idempotencyKey: "gmail:itau_transfer:message-test",
      transaction: {
        paymentType: "transfer",
        amount,
        currency,
        accountNumber: "****1357",
        destinationAccountNumber: "9876540",
        destinationBank: "Banco Itau",
        merchantRaw: "Transferencia a Banco Itau ****6540",
      },
      destination: {
        accountId: "source-currency",
        destinationAccountId: "destination-currency",
      },
    });
  },
);

test("unknown transfer account references never match cards or default account", () => {
  const value = mail(transfer);
  value.targets = {
    cards: {
      "1357": { creditCardId: "must-not-credit", accountId: "must-not-use" },
    },
    defaultAccountId: "must-not-guess",
  };
  expect(
    (
      runMailAutomation(value, ok).deliveries[0].payload as {
        destination: unknown;
      }
    ).destination,
  ).toEqual({});
});

test("reference-only transfer mappings are supported without guessing ownership", () => {
  const value = mail(transfer);
  value.targets.bankAccounts = {
    "1357": { accountId: "source" },
    "ITAU:9876540": { accountId: "destination" },
  };
  expect(runMailAutomation(value, ok).deliveries[0].payload).toMatchObject({
    destination: { accountId: "source", destinationAccountId: "destination" },
  });
});

test("owned destination matching includes the destination bank and cannot credit an account at another bank",()=>{
  const value=mail({...transfer,body:transfer.body.replace("Banco Itau","Other bank")});
  value.targets.bankAccounts={"1357:USD":{accountId:"source"},"9876540:USD":{accountId:"unscoped-must-not-use"},"ITAU:9876540:USD":{accountId:"owned-itau"}};
  expect(runMailAutomation(value,ok).deliveries[0].payload).toMatchObject({destination:{accountId:"source"}});
  expect((runMailAutomation(value,ok).deliveries[0].payload as {destination:Record<string,string>}).destination.destinationAccountId).toBeUndefined();
  value.targets.bankAccounts["OTHER BANK:9876540:USD"]={accountId:"owned-other"};
  expect(runMailAutomation(value,ok).deliveries[0].payload).toMatchObject({destination:{accountId:"source",destinationAccountId:"owned-other"}});
});

test("a known owned destination without source mapping remains pending until configuration is completed",()=>{
  const value=mail(transfer);
  value.targets.bankAccounts={"ITAU:9876540:USD":{accountId:"destination"}};
  const pending=runMailAutomation(value,ok);
  expect(pending.deliveries).toHaveLength(0);
  expect(pending.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  expect(pending.threads[0].messages[0].isRead).toBe(false);
  expect(pending.logs.join(" ")).toMatch(/origen/i);
  value.targets.bankAccounts["1357:USD"]={accountId:"source"};
  expect(runMailAutomation(value,ok).threads[0].labels).toEqual(["Wallet/Procesado"]);
});

test.each(["1.2,34 UYU","1,2.34 UYU","12.3456 UYU","1.23.456,78 UYU"])("malformed transfer amount %s is retained unread instead of silently changing value",raw=>{
  const value=mail({...transfer,body:transfer.body.replace("44.00 USD",raw)});
  const result=runMailAutomation(value,ok);
  expect(result.deliveries).toHaveLength(0);
  expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  expect(result.threads[0].messages[0].isRead).toBe(false);
});

test("mixed ignored, successful and failed messages close only after idempotent retry", () => {
  const value = mail(ignored, credit, { ...credit, id: "message-two" });
  const failed = runMailAutomation(value, (_url, options) =>
    JSON.parse(String(options.payload)).email.messageId === "message-two"
      ? { status: 503, body: "temporary failure" }
      : ok(),
  );
  expect(failed.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  expect(failed.threads[0].messages.map((message) => message.isRead)).toEqual([
    true,
    true,
    false,
  ]);
  const retried = runMailAutomation(
    { ...value, threads: failed.threads },
    () => ({ status: 200, body: '{"data":{"status":"duplicate"}}' }),
  );
  expect(retried.threads[0].labels).toEqual(["Wallet/Procesado"]);
  expect(retried.threads[0].messages.every((message) => message.isRead)).toBe(
    true,
  );
  expect(
    retried.deliveries.map(
      (delivery) =>
        (delivery.payload as { idempotencyKey: string }).idempotencyKey,
    ),
  ).toEqual([
    "gmail:itau_credit_card:message-test",
    "gmail:itau_credit_card:message-two",
  ]);
});

test("a parser failure does not prevent other messages being completed and read", () => {
  const value = mail(
    {
      ...credit,
      id: "bad",
      body: "Importe: 1,23,45 UYU\nComercio: TEST MARKET\nVISA nro. ****1234",
    },
    ignored,
    debit,
  );
  const result = runMailAutomation(value, ok);
  expect(result.deliveries).toHaveLength(1);
  expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  expect(result.threads[0].messages.map((message) => message.isRead)).toEqual([
    false,
    true,
    true,
  ]);
});

test("new pending mail runs even when its thread retains the processed label", () => {
  const value = mail(credit);
  value.threads[0].labels.push("Wallet/Procesado");
  const result = runMailAutomation(value, ok);
  expect(result.deliveries).toHaveLength(1);
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
  expect(result.threads[0].messages[0].isRead).toBe(true);
});

test("pending history older than 30 days is recovered", () => {
  const result = runMailAutomation(
    mail({ ...credit, date: "2026-08-01T12:00:00.000Z" }),
    ok,
  );
  expect(result.deliveries).toHaveLength(1);
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
});

test.each([
  { ...debit, body: debit.body.replace("Dolares", "UNKNOWN") },
  { ...transfer, body: transfer.body.replace("44.00 USD", "44.00") },
  {
    ...transfer,
    body: transfer.body.replace(
      "Cuenta destino: 9876540",
      "Cuenta destino: unknown",
    ),
  },
  { ...transfer, body: transfer.body.replace("44.00 USD", "1.23. USD") },
  { ...credit, body: credit.body.replace("UYU", "XYZ") },
])("invalid financial metadata stays pending: $body", (message) => {
  const result = runMailAutomation(mail(message), ok);
  expect(result.deliveries).toEqual([]);
  expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  expect(result.threads[0].messages[0].isRead).toBe(false);
});

test("malformed recognized automation purchase is retained instead of ignored", () => {
  const message = {
    ...ignored,
    body: "Tarjeta / Pase: INTERNACIONAL\nNombre / Contraparte: TEST MARKET\nMonto: unknown",
  };
  const result = runMailAutomation(mail(message), ok);
  expect(result.deliveries).toEqual([]);
  expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  expect(result.threads[0].messages[0].isRead).toBe(false);
});

test("automation alias credit mapping keeps the existing idempotency contract", () => {
  const message = {
    ...ignored,
    body: "Tarjeta / Pase: Internacional\nNombre / Contraparte: TEST MARKET\nMonto: UYU 125,50",
  };
  const value = mail(message);
  value.targets.cards.INTERNACIONAL = { creditCardId: "alias-card" };
  expect(runMailAutomation(value, ok).deliveries[0].payload).toMatchObject({
    idempotencyKey: "gmail:automation_wallet:ignored",
    transaction: { paymentType: "credit_card", amount: 125.5, currency: "UYU" },
    destination: { creditCardId: "alias-card" },
  });
});

test("HTML-only debit body is normalized before ingestion", () => {
  const result = runMailAutomation(
    mail({ ...debit, body: "", html: `<div>${debit.body}</div>` }),
    ok,
  );
  expect(result.deliveries[0].payload).toMatchObject({
    transaction: { paymentType: "debit", amount: 95.84 },
  });
});

test("Gmail wraps the approved debit sentence and merchant without changing the purchase", () => {
  const result = runMailAutomation(mail({
    ...debit,
    body: "*Aviso de consumo aprobado con tarjeta de débito* *Se aprobo un consumo de\nsu tarjeta Visa terminada en 2468 . Realizado en TEST *SUBSCRIPTION\nMonto: 95.84 Dolares. Si no fuiste tú comunícate al 1784.*",
  }), ok);
  expect(result.deliveries[0]?.payload).toMatchObject({
    transaction: { paymentType: "debit", amount: 95.84, merchantRaw: "TEST *SUBSCRIPTION" },
  });
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
});

test.each(["*44.00* *USD*", "*44.00 USD*", "*USD 44.00*"])("Gmail transfer amount %s preserves the masked account and amount", (formattedAmount) => {
  const value = mail({
    ...transfer,
    body: `*Aviso de transferencia realizada*\nTransferencia realizada desde la cuenta *****1357*\nImporte: ${formattedAmount}\nCuenta destino: *9876540*\nBanco/Institución destino: *Banco Itau*`,
  });
  value.targets.bankAccounts = {
    "1357:USD": { accountId: "origin-account" },
    "ITAU:9876540:USD": { accountId: "destination-account" },
  };
  const result = runMailAutomation(value, ok);
  expect(result.deliveries[0]?.payload).toMatchObject({
    transaction: {
      paymentType: "transfer", amount: 44, currency: "USD", accountNumber: "****1357",
      destinationAccountNumber: "9876540", destinationBank: "Banco Itau",
    },
    destination: { accountId: "origin-account", destinationAccountId: "destination-account" },
  });
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
});
