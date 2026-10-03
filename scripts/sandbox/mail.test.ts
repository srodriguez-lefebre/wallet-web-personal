import { expect, test } from "vitest";
import { runMailAutomation, type MailRunInput } from "./mail.js";

const input: MailRunInput = {
  now: "2026-10-03T12:00:00.000Z",
  ingestUrl: "http://127.0.0.1:4173/api/ingest/mail/transactions",
  ingestToken: "test-only",
  targets: { cards: { "1234": { creditCardId: "card-test" } } },
  threads: [
    {
      id: "thread-test",
      labels: ["Wallet/Pendiente"],
      messages: [
        {
          id: "message-test",
          from: "comunicaciones@itau.com.uy",
          subject: "Aviso de consumo aprobado con tarjeta de crédito",
          date: "2026-10-02T12:00:00.000Z",
          body: "Importe: 1.234,56 UYU\nComercio: TEST MARKET\nVISA nro. ****1234",
        },
      ],
    },
  ],
};

test("actual Apps Script builds the consumption payload and labels successful threads", () => {
  let sent: unknown;
  const result = runMailAutomation(input, (_url, options) => {
    sent = JSON.parse(String(options.payload));
    return { status: 201, body: '{"data":{"status":"created"}}' };
  });
  expect(sent).toMatchObject({
    idempotencyKey: "gmail:itau_credit_card:message-test",
    transaction: {
      amount: 1234.56,
      currency: "UYU",
      merchantRaw: "TEST MARKET",
    },
    destination: { creditCardId: "card-test" },
  });
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
  expect(input.threads[0].labels).toEqual(["Wallet/Pendiente"]);
});

test("a failed send preserves pending labels and the same key for retry", () => {
  const failed = runMailAutomation(input, () => ({
    status: 503,
    body: "temporary failure",
  }));
  expect(failed.threads[0].labels).toEqual(["Wallet/Pendiente"]);
  const retried = runMailAutomation(
    { ...input, threads: failed.threads },
    () => ({ status: 200, body: '{"data":{"status":"duplicate"}}' }),
  );
  expect(retried.threads[0].labels).toEqual(["Wallet/Procesado"]);
});

test("unsupported mail stays pending while old pending mail is recovered", () => {
  const ignored = structuredClone(input);
  ignored.threads.push({
    id: "old",
    labels: ["Wallet/Pendiente"],
    messages: [
      { ...input.threads[0].messages[0], date: "2026-08-01T12:00:00.000Z" },
    ],
  });
  ignored.threads[0].messages[0].body = "not a consumption";
  const result = runMailAutomation(ignored, () => ({status:201,body:"{}"}));
  expect(result.deliveries).toHaveLength(1);
  expect(result.threads.map((thread) => thread.labels)).toEqual([
    ["Wallet/Pendiente"],
    ["Wallet/Procesado"],
  ]);
});

test.each(["1.234,56","1,234.56","1234.56","1234,56","1.234","1,234"])("parses bank amount %s without losing thousands",(raw)=>{
  const mail=structuredClone(input);
  mail.threads[0].messages[0].body=`Importe: ${raw} UYU\nComercio: TEST MARKET\nVISA nro. ****1234`;
  let amount=0;
  runMailAutomation(mail,(_url,options)=>{amount=JSON.parse(String(options.payload)).transaction.amount;return {status:201,body:"{}"};});
  expect(amount).toBe(raw==="1.234"||raw==="1,234"?1234:1234.56);
});
test("a parser error leaves that message pending and does not abort other messages",()=>{
  const mail=structuredClone(input);
  mail.threads[0].messages.unshift({...mail.threads[0].messages[0],id:"bad",body:"Importe: 1,23,45 UYU\nComercio: TEST MARKET\nVISA nro. ****1234"});
  const result=runMailAutomation(mail,()=>({status:201,body:"{}"}));
  expect(result.deliveries).toHaveLength(1);
  expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
});

test("a partial failure leaves the entire thread pending", () => {
  const two = structuredClone(input);
  two.threads[0].messages.push({
    ...two.threads[0].messages[0],
    id: "message-two",
  });
  let call = 0;
  const result = runMailAutomation(two, () => ({
    status: ++call === 1 ? 201 : 500,
    body: "{}",
  }));
  expect(result.deliveries).toHaveLength(2);
  expect(result.threads[0].labels).toEqual(["Wallet/Pendiente"]);
});
