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
await stat(dbDirectory).catch(() => {
  throw new Error(
    "Run npm run sandbox:setup -- --backup <snapshot.json> first",
  );
});
const release = await acquireWorkspaceLock();
configureLocalEnvironment();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
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
async function stop() {
  if (stopping) return;
  stopping = true;
  await vite?.close();
  await new Promise<void>((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeIdleConnections();
  });
  await pg?.close();
  restoreTransport();
  globalThis.fetch = originalFetch;
  await release();
}
try {
  pg = await PGlite.create(dbDirectory);
  restoreTransport = installLocalTransport(pg);
  await applyMigrations(pg);
  server = await createSandboxServer({
    pg,
    mailboxPath: mailboxFile,
    frontend: (req, res) => vite!.middlewares(req, res),
    onStop: () => {
      void stop();
    },
  });
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
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", resolve);
  });
  console.log(`Local wallet: ${origin}`);
  console.log(`Mail simulator: ${origin}/__sandbox`);
  console.log(
    "Production credentials and external network are disabled. Ctrl+C or npm run sandbox:stop closes the sandbox.",
  );
  process.once("SIGINT", () => {
    void stop();
  });
  process.once("SIGTERM", () => {
    void stop();
  });
} catch (error) {
  await stop();
  throw error;
}
