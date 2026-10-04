import type { PGlite } from "@electric-sql/pglite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getWalletDataset } from "../../server/db/wallet-repository.js";
import { json, readJson, serveWalletApi } from "./http.js";
import {
  runMailWorker,
  type MailTargets,
  type SimulatedThread,
  type MailRunResult,
} from "./mail.js";
import { writePrivateJson } from "./workspace.js";
import { panelHtml } from "./panel.js";

const messageSchema = z.object({
  from: z.string().min(1).max(500),
  subject: z.string().min(1).max(500),
  date: z.iso.datetime(),
  body: z.string().max(100_000),
  html: z.string().max(100_000).optional(),
  threadId: z.string().max(200).optional(),
});
const targetsSchema = z.object({
  defaultAccountId: z.uuid().optional(),
  cards: z.record(
    z.string().max(200),
    z.object({
      creditCardId: z.uuid().optional(),
      accountId: z.uuid().optional(),
    }),
  ),
});
interface Mailbox {
  threads: SimulatedThread[];
  targets: MailTargets;
  lastRun?: MailRunResult;
}

export async function createSandboxServer(options: {
  pg: PGlite;
  mailboxPath: string;
  frontend?: (req: IncomingMessage, res: ServerResponse) => void;
  onStop?: () => void;
}) {
  let mailbox: Mailbox;
  try {
    mailbox = JSON.parse(await readFile(options.mailboxPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const dataset = await getWalletDataset();
    mailbox = {
      threads: [],
      targets: {
        cards: Object.fromEntries(
          dataset.creditCards.map((card) => [
            card.lastFour,
            { creditCardId: card.id },
          ]),
        ),
      },
    };
  }
  let running = false;
  let mutation: Promise<unknown> = Promise.resolve();
  const save = () => writePrivateJson(options.mailboxPath, mailbox);
  const serve = async (req: IncomingMessage, res: ServerResponse) => {
    const address = server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;
    if (
      req.headers.host !== `127.0.0.1:${address.port}` ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      json(res, { error: "Only the local sandbox origin is allowed" }, 403);
      return;
    }
    const url = new URL(req.url!, origin);
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      await serveWalletApi(req, res);
      return;
    }
    if (url.pathname === "/__sandbox" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(panelHtml);
      return;
    }
    if (url.pathname === "/__sandbox/state" && req.method === "GET") {
      const dataset = await getWalletDataset();
      json(res, {
        ...mailbox,
        running,
        accounts: dataset.accounts,
        creditCards: dataset.creditCards,
        counts: {
          records: dataset.records.length,
          creditCardRecords: dataset.creditCardRecords.length,
        },
      });
      return;
    }
    if (url.pathname.startsWith("/__sandbox/") && req.method === "POST") {
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        json(res, { error: "JSON is required" }, 415);
        return;
      }
      const body = await readJson(req);
      if (running) {
        json(
          res,
          { error: "Mail trigger is running; wait for it to finish" },
          409,
        );
        return;
      }
      switch (url.pathname) {
        case "/__sandbox/messages": {
          const parsed = messageSchema.parse(body);
          let thread = mailbox.threads.find(
            (entry) => entry.id === parsed.threadId,
          );
          if (!thread) {
            thread = {
              id: randomUUID(),
              labels: ["Wallet/Pendiente"],
              messages: [],
            };
            mailbox.threads.push(thread);
          }
          thread.messages.push({
            id: randomUUID(),
            from: parsed.from,
            subject: parsed.subject,
            date: parsed.date,
            body: parsed.body,
            html: parsed.html,
          });
          await save();
          json(res, thread, 201);
          return;
        }
        case "/__sandbox/targets":
          mailbox.targets = targetsSchema.parse(body);
          await save();
          json(res, mailbox.targets);
          return;
        case "/__sandbox/requeue": {
          const { threadId } = z.object({ threadId: z.string() }).parse(body);
          const thread = mailbox.threads.find((entry) => entry.id === threadId);
          if (!thread) {
            json(res, { error: "Thread not found" }, 404);
            return;
          }
          thread.labels = ["Wallet/Pendiente"];
          await save();
          json(res, thread);
          return;
        }
        case "/__sandbox/run": {
          running = true;
          try {
            const result = await runMailWorker({
              ...mailbox,
              ingestUrl: `${origin}/api/ingest/mail/transactions`,
              ingestToken: process.env.INGEST_API_TOKEN!,
            });
            mailbox.threads = result.threads;
            mailbox.lastRun = result;
            await save();
            json(res, result);
          } finally {
            running = false;
          }
          return;
        }
        case "/__sandbox/stop":
          json(res, { stopping: true });
          setTimeout(() => options.onStop?.(), 50);
          return;
        default:
          json(res, { error: "Unknown sandbox route" }, 404);
          return;
      }
    }
    if (options.frontend) options.frontend(req, res);
    else json(res, { error: "Not found" }, 404);
  };
  const server = createServer((req, res) => {
    const execute = () =>
      serve(req, res).catch((error) => {
        if (!res.headersSent)
          json(
            res,
            {
              error:
                error instanceof z.ZodError
                  ? error.issues[0].message
                  : error instanceof Error
                    ? error.message
                    : "Sandbox request failed",
            },
            400,
          );
        else res.end();
      });
    // Serialize mailbox writes; API requests must remain free while the trigger sends.
    if (req.method === "POST" && req.url?.startsWith("/__sandbox/")) {
      if (running) {
        json(res, { error: "Mail trigger is already running" }, 409);
        return;
      }
      mutation = mutation.then(execute, execute);
    } else void execute();
  });
  return server;
}
