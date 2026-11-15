// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import {
  walletDatasetSchema,
  walletRecordResponseSchema,
  walletBackupSchema,
} from "@shared/schemas";
import { walletReferenceSchema } from "@shared/reference-contract";

import { createWalletClient } from "./api-client";
import { createWalletMutations } from "./mutations";
import { createWalletQueryClient, referenceKey } from "./wallet-queries";
import { createWalletActions } from "./wallet-actions";
import { reference, record, id } from "../test/wallet-fixtures";

const server = setupServer();
const response = (data: unknown) => HttpResponse.json({ data, error: null });
const refs = walletReferenceSchema.parse(reference);
const snapshot = walletDatasetSchema.parse({
  ...reference,
  accounts: [
    {
      id,
      name: "Synthetic snapshot bank",
      type: "bank",
      currency: "UYU",
      initialBalance: 1000,
      color: "blue",
      icon: "bank",
      isActive: true,
      isVisible: true,
    },
  ],
  categories: [{ id, name: "Synthetic snapshot category", color: "blue", icon: "tag" }],
  records: [record],
  creditCardRecords: [],
  creditCardStatements: [],
  creditCardPayments: [],
  creditCardPaymentAllocations: [],
});
const caches: ReturnType<typeof createWalletQueryClient>[] = [];
function setup(waitForWrites = () => Promise.resolve()) {
  const cache = createWalletQueryClient();
  caches.push(cache);
  cache.setQueryData(referenceKey, refs);
  const controller = new AbortController();
  const client = createWalletClient(() => "synthetic-domain-actions", { retryDelayMs: 0 });
  const archived = vi.fn();
  const actions = createWalletActions(
    client,
    createWalletMutations(client, cache, { signal: controller.signal }),
    { signal: controller.signal, getReference: () => refs, onArchived: archived, waitForWrites },
  );
  return { actions, cache, controller, archived };
}
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  for (const cache of caches.splice(0)) cache.clear();
});
afterAll(() => server.close());

test("generated CRUD aliases retain IDs, sparse patches and archived-filter callbacks", async () => {
  const account = {
    name: "Synthetic bank",
    type: "bank" as const,
    currency: "UYU" as const,
    initialBalance: 1000,
    color: "blue",
    icon: "bank",
    isActive: true,
    isVisible: true,
  };
  let patch: unknown;
  server.use(
    http.post("http://test.local/api/accounts", () => response({ ...account, id })),
    http.patch(`http://test.local/api/accounts/${id}`, async ({ request }) => {
      patch = await request.json();
      return response({ ...account, id, name: "Renamed" });
    }),
    http.delete(`http://test.local/api/categories/${id}`, () =>
      response({
        deleted: true,
        fallbackCategoryId: id,
        archivedCategoryIds: [id],
        reassigned: {},
      }),
    ),
  );
  const { actions, archived } = setup();
  expect(await actions.addAccount(account)).toBe(id);
  await actions.updateAccount(id, { name: "Renamed" });
  expect(patch).toEqual({ name: "Renamed" });
  await actions.deleteCategory(id);
  expect(archived).toHaveBeenCalledWith("Category", id);
});

test("record patch aliases return canonical timestamps for review undo", async () => {
  server.use(
    http.patch(`http://test.local/api/records/${id}`, () =>
      response({ ...record, note: "Synthetic edit", updatedAt: "2026-11-14T12:00:00.000Z" }),
    ),
  );
  const { actions } = setup();
  expect(await actions.updateRecord(id, { note: "Synthetic edit" })).toMatchObject({
    id,
    updatedAt: "2026-11-14T12:00:00.000Z",
  });
});

test("complete and backup reads are explicit and never replace the active reference cache", async () => {
  let snapshots = 0,
    backups = 0;
  server.use(
    http.get("http://test.local/api/wallet", () => {
      snapshots++;
      return response(snapshot);
    }),
    http.get("http://test.local/api/wallet/backup", () => {
      backups++;
      return response(walletBackupSchema.parse(snapshot));
    }),
  );
  const { actions, cache, controller } = setup();
  expect(snapshots).toBe(0);
  expect(backups).toBe(0);
  expect((await actions.getCompleteDataset()).records).toHaveLength(1);
  expect((await actions.getBackupDataset()).records).toHaveLength(1);
  expect(cache.getQueryData(referenceKey)).toBe(refs);
  expect(snapshots).toBe(1);
  expect(backups).toBe(1);
  controller.abort();
  await expect(actions.getCompleteDataset()).rejects.toMatchObject({ name: "AbortError" });
  expect(snapshots).toBe(1);
});

test("explicit backup waits for pending writes before requesting its independent snapshot", async () => {
  let release!: () => void,
    backups = 0;
  const waitForWrites = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  server.use(
    http.get("http://test.local/api/wallet/backup", () => {
      backups++;
      return response(walletBackupSchema.parse(snapshot));
    }),
  );
  const { actions } = setup(waitForWrites);
  const read = actions.getBackupDataset();
  await vi.waitFor(() => expect(waitForWrites).toHaveBeenCalledTimes(1));
  expect(backups).toBe(0);
  release();
  await read;
  expect(backups).toBe(1);
});

test("locking during an import prevents later batches from using another session", async () => {
  const { actions, controller } = setup();
  let batches = 0;
  server.use(
    http.get("http://test.local/api/wallet", () => response({ ...snapshot, records: [] })),
    http.post("http://test.local/api/records/import", () => {
      batches++;
      controller.abort();
      return response([]);
    }),
  );
  const { id: omittedId, ...base } = walletRecordResponseSchema.parse(record);
  void omittedId;
  const rows = Array.from({ length: 201 }, (_, index) => ({
    ...base,
    amount: index + 1,
    counterpartyName: `Synthetic row ${index}`,
  }));
  await expect(actions.importRecords(rows)).rejects.toThrow(/reconciliation|import/i);
  expect(batches).toBe(1);
});
