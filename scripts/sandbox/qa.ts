/** Disposable QA fixture: real router + in-memory PostgreSQL, synthetic data only.
 * Run: npx tsx scripts/sandbox/qa.ts (http://127.0.0.1:4175).
 * Stop: POST /__qa/stop or Ctrl+C. No .env, backup, or .local-wallet access.
 */
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createServer as createViteServer } from "vite";
import { applyMigrations, installLocalTransport } from "./database.js";
import { configureLocalEnvironment } from "./workspace.js";

configureLocalEnvironment();
const origin = "http://127.0.0.1:4175";
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.origin !== origin) return Promise.reject(new Error("QA refuses external network"));
  return originalFetch(input, init);
};
const pg = await PGlite.create();
const restoreTransport = installLocalTransport(pg);
await applyMigrations(pg);
const bank = randomUUID(),
  cash = randomUUID(),
  category = randomUUID();
const card = randomUUID(),
  overdueCard = randomUUID(),
  statement = randomUUID();
await pg.query(
  "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'QA Bank','bank','UYU',10000,'#2563eb','landmark'),($2,'QA Cash','cash','UYU',1000,'#16a34a','wallet')",
  [bank, cash],
);
await pg.query(
  "INSERT INTO categories(id,name,color,icon) VALUES($1,'QA Food','#16a34a','utensils')",
  [category],
);
for (let i = 1; i <= 45; i++)
  await pg.query("INSERT INTO categories(name,color,icon) VALUES($1,'#2563eb','tag')", [
    `QA Category ${String(i).padStart(2, "0")}`,
  ]);
await pg.query(
  "INSERT INTO settings(primary_currency,primary_account_id,review_seen_through) VALUES('UYU',$1,'2026-11-01T12:00:00Z')",
  [bank],
);
for (const [id, name, digits] of [
  [card, "QA Current", "1111"],
  [overdueCard, "QA Pending", "2222"],
]) {
  await pg.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,$2,'Synthetic bank',$3,10000,'UYU',3,12,'#2563eb','credit-card')",
    [id, name, digits],
  );
}
await pg.query(
  "INSERT INTO credit_card_statements(id,credit_card_id,cycle_start,cycle_end,due_at,closed_at) VALUES($1,$2,'2026-10-04','2026-11-03T23:59:59.999Z','2026-11-12T23:59:59.999Z','2026-11-03T23:59:59.999Z')",
  [statement, overdueCard],
);
await pg.query(
  "INSERT INTO credit_card_records(credit_card_id,statement_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,counterparty_name,occurred_at) VALUES($1,$2,'purchase',500,'UYU',500,1,$3,'QA Closed purchase','2026-10-20T15:00:00Z')",
  [overdueCard, statement, category],
);
for (const [account, date, status, merchant, note, createdAt, linked] of [
  [
    bank,
    "2026-11-13T02:38:00Z",
    "cleared",
    "QA Night purchase",
    "MiXeD Lunch\nsecond line",
    "2026-11-13T02:38:00Z",
    true,
  ],
  [
    cash,
    "2026-09-10T15:00:00Z",
    "needs_review",
    "QA Old review",
    "Older pending",
    "2026-09-10T15:00:00Z",
    false,
  ],
  [
    bank,
    "2026-11-12T15:00:00Z",
    "needs_review",
    "QA New review",
    "New pending",
    "2026-11-12T15:00:00Z",
    true,
  ],
] as const) {
  const id = randomUUID();
  await pg.query(
    "INSERT INTO records(id,type,amount,currency,account_id,account_amount,credit_card_id,category_id,counterparty_name,payment_type,payment_status,exchange_rate_to_primary,amount_in_limit_currency,exchange_rate_to_limit_currency,occurred_at,note,created_at) VALUES($1,'expense',100,'UYU',$2,100,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12)",
    [
      id,
      account,
      linked ? card : null,
      category,
      merchant,
      linked ? "credit" : "debit",
      status,
      linked ? 100 : null,
      linked ? 1 : null,
      date,
      note,
      createdAt,
    ],
  );
  if (linked)
    await pg.query(
      "INSERT INTO credit_card_records(credit_card_id,wallet_record_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,counterparty_name,occurred_at) VALUES($1,$2,'purchase',100,'UYU',100,1,$3,$4,$5)",
      [card, id, category, merchant, date],
    );
}
await pg.query(
  "INSERT INTO credit_card_payments(credit_card_id,amount,currency,amount_in_limit_currency,occurred_at) VALUES($1,10,'UYU',10,'2026-11-13T02:38:00Z')",
  [card],
);
const { serveWalletApi } = await import("./http.js");
let stopping = false;
const server = createServer((req, res) => {
  if (
    req.headers.host !== "127.0.0.1:4175" ||
    (req.headers.origin && req.headers.origin !== origin)
  ) {
    res.writeHead(403).end();
    return;
  }
  if (req.url === "/__qa/stop" && req.method === "POST") {
    res.end("Stopping QA");
    void stop();
  } else if (req.url?.startsWith("/api")) {
    void serveWalletApi(req, res);
  } else vite.middlewares(req, res);
});
async function stop() {
  if (stopping) return;
  stopping = true;
  await vite.close();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  await pg.close();
  restoreTransport();
  globalThis.fetch = originalFetch;
}
const vite = await createViteServer({
  envDir: false,
  mode: "wallet-qa",
  clearScreen: false,
  server: { middlewareMode: true, host: "127.0.0.1", hmr: { server } },
  plugins: [
    {
      name: "qa-banner",
      transformIndexHtml: (html) =>
        html.replace(
          "<body>",
          '<body><div style="padding:8px;background:#fef3c7;color:#713f12;text-align:center">Synthetic QA data · Changes disappear when this server stops</div>',
        ),
    },
  ],
});
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
server.listen(4175, "127.0.0.1", () =>
  console.log(`Synthetic QA: ${origin} — unlock: wallet-local-test`),
);
