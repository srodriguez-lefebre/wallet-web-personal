import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  finishOpening: () => {},
  opening: () => {},
  started: Promise.resolve(),
  gate: Promise.resolve(),
  directory: "",
  stage: "database",
  events: [] as string[],
  async enter(stage: string) {
    this.events.push(stage);
    if (stage === this.stage) {
      this.opening();
      await this.gate;
    }
  },
}));

// Stall each resource boundary without opening web ports or the real sandbox.
vi.mock("@electric-sql/pglite", () => ({
  PGlite: {
    create: async () => {
      await state.enter("database");
      return {
        close: async () => {
          state.events.push("database.close");
        },
      };
    },
  },
}));
vi.mock("./database.js", () => ({
  applyMigrations: () => state.enter("migrations"),
  installLocalTransport: () => () => {},
}));
vi.mock("./workspace.js", () => ({
  dbDirectory: os.tmpdir(),
  mailboxFile: "unused",
  configureLocalEnvironment: () => {},
  acquireWorkspaceLock: async () => {
    await state.enter("lock");
    const lock = path.join(state.directory, "process.lock");
    await writeFile(lock, "owned");
    return async () => {
      state.events.push("release");
      await rm(lock);
    };
  },
}));
vi.mock("./server.js", () => ({
  createSandboxServer: async () => {
    await state.enter("server");
    const server = Object.assign(new EventEmitter(), {
      listening: false,
      listen: (_port: number, _host: string, ready: () => void) => {
        void state.enter("listen").then(() => {
          server.listening = true;
          ready();
        });
      },
      close: (closed: () => void) => {
        state.events.push("server.close");
        server.listening = false;
        closed();
      },
      closeIdleConnections: () => {},
    });
    return server;
  },
}));
vi.mock("vite", () => ({
  createServer: async () => {
    await state.enter("vite");
    return {
      close: async () => {
        state.events.push("vite.close");
      },
      middlewares: () => {},
    };
  },
}));

const stages = ["lock", "database", "migrations", "server", "vite", "listen"];
const signals = ["SIGINT", "SIGTERM"] as const;
test.each(
  stages.flatMap((stage) =>
    signals.map((signal) => [stage, signal] as const),
  ),
)(
  "%s interrupted by %s closes resources before releasing the lock and skips later startup steps",
  async (stage, signal) => {
    vi.resetModules();
    state.stage = stage;
    state.events = [];
    state.started = new Promise<void>((resolve) => {
      state.opening = resolve;
    });
    state.gate = new Promise<void>((resolve) => {
      state.finishOpening = resolve;
    });
    state.directory = await mkdtemp(
      path.join(os.tmpdir(), "wallet-start-test-"),
    );
    const previous = new Map(
      signals.map((name) => [
        name,
        new Set(process.listeners(name)),
      ]),
    );
    const originalFetch = globalThis.fetch;
    const startup = import("./start.js");
    try {
      await state.started;
      const handler = process
        .listeners(signal)
        .find((listener) => !previous.get(signal)!.has(listener));
      expect(handler, "startup must already handle cancellation").toBeDefined();
      handler!(signal);
      if (stage !== "lock")
        expect(
          await readFile(path.join(state.directory, "process.lock"), "utf8"),
        ).toBe("owned");
      expect(state.events).not.toContain("release");
      state.finishOpening();
      await startup;
      expect(state.events.filter((event) => stages.includes(event))).toEqual(
        stages.slice(0, stages.indexOf(stage) + 1),
      );
      expect(state.events.at(-1)).toBe("release");
      if (stage !== "lock") expect(state.events).toContain("database.close");
      if (["vite", "listen"].includes(stage))
        expect(state.events).toContain("vite.close");
      if (stage === "listen") expect(state.events).toContain("server.close");
      await expect(
        readFile(path.join(state.directory, "process.lock")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(globalThis.fetch).toBe(originalFetch);
      for (const name of signals)
        expect(
          process
            .listeners(name)
            .filter((listener) => !previous.get(name)!.has(listener)),
        ).toEqual([]);
    } finally {
      state.finishOpening();
      await startup.catch(() => undefined);
      for (const name of signals)
        for (const listener of process.listeners(name))
          if (!previous.get(name)!.has(listener))
            process.removeListener(name, listener);
      globalThis.fetch = originalFetch;
      await rm(state.directory, { recursive: true, force: true });
    }
  },
);
