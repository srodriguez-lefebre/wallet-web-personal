import { expect, test, vi } from "vitest";
import { WalletSync } from "./wallet-sync";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a background response cannot resurrect a deleted record", async () => {
  const old = deferred<string[]>();
  const publish = vi.fn();
  const sync = new WalletSync(publish);
  const background = sync.read(() => old.promise);
  await sync.mutate(
    async () => undefined,
    async () => ["remaining"],
  );
  old.resolve(["deleted", "remaining"]);
  await background;
  expect(publish.mock.calls.map(([value]) => value)).toEqual([["remaining"]]);
});

test("mutations serialize and a refresh failure rejects after the committed write", async () => {
  const sync = new WalletSync<string[]>(vi.fn());
  const written: string[] = [];
  await expect(
    sync.mutate(
      async () => {
        written.push("saved");
      },
      async () => {
        throw new Error("offline");
      },
    ),
  ).rejects.toThrow(/saved.*refresh/i);
  expect(written).toEqual(["saved"]);
  await expect(
    sync.mutate(
      async () => 2,
      async () => ["recovered"],
    ),
  ).resolves.toBe(2);
});

test("retry refresh runs even when pagination status has not changed", async () => {
  const publish = vi.fn();
  const sync = new WalletSync<string[]>(publish);
  await expect(
    sync.read(async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  await sync.read(async () => ["complete"]);
  expect(publish).toHaveBeenCalledWith(["complete"]);
});

test("account archival retains canonical history and refresh waits for pending mutations", async () => {
  const saving = deferred<void>();
  const canonical = {
    accounts: [{ id: "account", isActive: false }],
    records: [{ id: "history", accountId: "account" }],
  };
  const publish = vi.fn();
  const sync = new WalletSync<typeof canonical>(publish);
  const mutation = sync.mutate(
    () => saving.promise,
    async () => canonical,
  );
  const load = vi.fn(async () => canonical);
  const exportSnapshot = sync.refresh(load);
  expect(load).not.toHaveBeenCalled();
  saving.resolve();
  await mutation;
  expect(await exportSnapshot).toEqual(canonical);
  expect(publish).toHaveBeenLastCalledWith(canonical);
});

test("partial import failure still publishes successfully committed earlier batches", async () => {
  const publish = vi.fn();
  const sync = new WalletSync<string[]>(publish);
  await expect(
    sync.mutate(
      async () => {
        throw new Error("200 saved; later batch failed");
      },
      async () => ["saved first batch"],
    ),
  ).rejects.toThrow("200 saved");
  expect(publish).toHaveBeenCalledWith(["saved first batch"]);
});
