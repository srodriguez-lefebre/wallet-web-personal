import { PGlite } from "@electric-sql/pglite";
import { createServer as createViteServer } from "vite";
import { stat } from "node:fs/promises";
import type { Server } from "node:http";
import { applyMigrations, installLocalTransport } from "./database.js";
import { createSandboxServer } from "./server.js";
import {
  acquireWorkspaceLock,
  configureLocalEnvironment,
  dbDirectory,
  mailboxFile,
} from "./workspace.js";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
let release = async () => {};
const originalFetch = globalThis.fetch;
const localFetch: typeof fetch = (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.origin !== origin)
    return Promise.reject(
      new Error("External network is disabled in the wallet sandbox"),
    );
  return originalFetch(input, init);
};
let pg: PGlite | undefined;
let restoreTransport = () => {};
let server: Server | undefined;
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
let stopping = false;
let finishStartup!: () => void;
const startupFinished = new Promise<void>((resolve) => {
  finishStartup = resolve;
});
const cancelled = new Error("Sandbox startup cancelled");
const checkRunning = () => {
  if (stopping) throw cancelled;
};
let shutdown: Promise<void> | undefined;
function stop() {
  stopping = true;
  return (shutdown ??= (async () => {
    // Pending startup steps retain ownership until their result can be closed.
    await startupFinished;
    let failure: unknown;
    for (const cleanup of [
      () => vite?.close(),
      () =>
        new Promise<void>((resolve) => {
          if (!server?.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
          server.closeIdleConnections();
        }),
      () => pg?.close(),
      () => {
        restoreTransport();
        globalThis.fetch = originalFetch;
      },
      () => release(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failure ??= error;
      }
    }
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (failure) throw failure;
  })());
}
function onSignal() {
  void stop().catch((error: unknown) => {
    console.error("Sandbox shutdown failed:", error);
    process.exitCode = 1;
  });
}
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);
try {
  await stat(dbDirectory).catch(() => {
    throw new Error(
      "Run npm run sandbox:setup -- --backup <snapshot.json> first",
    );
  });
  checkRunning();
  release = await acquireWorkspaceLock();
  checkRunning();
  configureLocalEnvironment();
  globalThis.fetch = localFetch;
  pg = await PGlite.create(dbDirectory);
  checkRunning();
  restoreTransport = installLocalTransport(pg);
  await applyMigrations(pg);
  checkRunning();
  server = await createSandboxServer({
    pg,
    mailboxPath: mailboxFile,
    frontend: (req, res) => vite!.middlewares(req, res),
    onStop: () => {
      onSignal();
    },
  });
  checkRunning();
  vite = await createViteServer({
    envDir: false,
    mode: "wallet-local",
    clearScreen: false,
    server: { middlewareMode: true, host: "127.0.0.1", hmr: { server } },
    plugins: [
      {
        name: "wallet-sandbox-banner",
        transformIndexHtml: (html) =>
          html.replace(
            "<body>",
            '<body><div style="padding:8px;text-align:center;background:#fef3c7;color:#713f12;font:14px system-ui">Entorno local de prueba · <a href="/__sandbox">Simulador de correos</a></div>',
          ),
      },
    ],
  });
  checkRunning();
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", resolve);
  });
  checkRunning();
  console.log(`Local wallet: ${origin}`);
  console.log(`Mail simulator: ${origin}/__sandbox`);
  console.log(
    "Production credentials and external network are disabled. Ctrl+C or npm run sandbox:stop closes the sandbox.",
  );
} catch (error) {
  stopping = true;
  if (error !== cancelled) throw error;
} finally {
  finishStartup();
  if (stopping) await stop();
}
