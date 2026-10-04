export interface SimulatedMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  html?: string;
}
export interface SimulatedThread {
  id: string;
  labels: string[];
  messages: SimulatedMessage[];
}
export interface MailTargets {
  defaultAccountId?: string;
  cards: Record<string, { creditCardId?: string; accountId?: string }>;
}
export interface MailRunInput {
  threads: SimulatedThread[];
  targets: MailTargets;
  ingestUrl: string;
  ingestToken: string;
  now?: string;
}
export interface MailResponse {
  status: number;
  body: string;
}
export interface MailRunResult {
  threads: SimulatedThread[];
  logs: string[];
  deliveries: Array<{ payload: unknown; status: number; body: string }>;
}

export function runMailAutomation(
  input: MailRunInput,
  send: (url: string, options: Record<string, unknown>) => MailResponse,
): MailRunResult {
  const threads = structuredClone(input.threads);
  const logs: string[] = [];
  const deliveries: MailRunResult["deliveries"] = [];
  const label = (name: string) => ({ name });
  const props: Record<string, string> = {
    WALLET_INGEST_URL: input.ingestUrl,
    WALLET_INGEST_TOKEN: input.ingestToken,
    WALLET_TARGETS_JSON: JSON.stringify(input.targets),
  };
  const context = {
    console: Object.fromEntries(
      ["log", "warn", "error"].map((level) => [
        level,
        (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      ]),
    ),
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name: string) => props[name],
      }),
    },
    GmailApp: {
      getUserLabelByName: label,
      createLabel: label,
      search: (_query: string, start: number, limit: number) =>
        threads
          .filter(
            (thread) =>
              thread.labels.includes("Wallet/Pendiente") &&
              !thread.labels.includes("Wallet/Procesado"),
          )
          .slice(start, start + limit)
          .map((thread) => ({
            getId: () => thread.id,
            getMessageCount: () => thread.messages.length,
            getMessages: () =>
              thread.messages.map((message) => ({
                getId: () => message.id,
                getSubject: () => message.subject,
                getFrom: () => message.from,
                getDate: () => new Date(message.date),
                getPlainBody: () => message.body,
                getBody: () => message.html ?? message.body,
              })),
            addLabel: (value: { name: string }) => {
              if (!thread.labels.includes(value.name))
                thread.labels.push(value.name);
            },
            removeLabel: (value: { name: string }) => {
              thread.labels = thread.labels.filter(
                (name) => name !== value.name,
              );
            },
          })),
    },
    UrlFetchApp: {
      fetch: (url: string, options: Record<string, unknown>) => {
        if (url !== input.ingestUrl)
          throw new Error("Sandbox refused a different ingest URL");
        const response = send(url, options);
        deliveries.push({
          payload: JSON.parse(String(options.payload)),
          ...response,
        });
        return {
          getResponseCode: () => response.status,
          getContentText: () => response.body,
        };
      },
    },
  };
  const source = ["EmailProcessors.gs", "Code.gs"]
    .map((name) =>
      readFileSync(
        new URL(`../../mail-service/${name}`, import.meta.url),
        "utf8",
      ),
    )
    .join("\n");
  try {
    runInNewContext(`${source}\nprocessPendingEmails();`, context, {
      timeout: 120_000,
    });
  } catch (error) {
    // Preserve successful prior threads and pending failures, like a stopped trigger.
    logs.push(
      `Ejecución interrumpida: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { threads, logs, deliveries };
}

export function runMailWorker(input: MailRunInput): Promise<MailRunResult> {
  const url = new URL(input.ingestUrl);
  if (
    url.hostname !== "127.0.0.1" ||
    url.protocol !== "http:" ||
    url.pathname !== "/api/ingest/mail/transactions"
  )
    throw new Error("Only local ingestion is allowed");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mail-worker.mjs", import.meta.url), {
      workerData: input,
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(
        new Error(
          "Simulated trigger timed out; pending messages can be retried",
        ),
      );
    }, 125_000);
    worker.once("message", (result: MailRunResult) => {
      clearTimeout(timer);
      resolve(result);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Mail worker exited with ${code}`));
    });
  });
}
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
