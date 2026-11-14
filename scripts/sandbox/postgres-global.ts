import { fork } from "node:child_process";

import type { TestProject } from "vitest/node";

export interface TestPostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    walletPostgres: TestPostgresConfig;
  }
}

/** Keep embedded-postgres exit hooks out of the Vitest coordinator. */
export default async function setup(project: TestProject) {
  const worker = fork(new URL("./postgres-cluster.ts", import.meta.url), [], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const closed = new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PostgreSQL fixture exited with code ${code}`));
    });
  });
  // Startup failure can reject both promises; cleanup still awaits the original.
  void closed.catch(() => {});
  const config = await new Promise<TestPostgresConfig>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.kill("SIGTERM");
      reject(new Error("PostgreSQL fixture startup timed out"));
    }, 30_000);
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`PostgreSQL fixture exited before ready (${code})`));
    });
    worker.once("message", (message: unknown) => {
      clearTimeout(timer);
      const value = message as { type?: string; config?: TestPostgresConfig; error?: string };
      if (value.type === "ready" && value.config) resolve(value.config);
      else reject(new Error(value.error ?? "Invalid PostgreSQL fixture response"));
    });
  });
  project.provide("walletPostgres", config);
  return async () => {
    if (worker.connected) worker.send({ type: "stop" });
    await closed;
  };
}
