import { createRecord, deleteRecord, listRecords, updateRecord } from "../../db/index.js";
import { importWalletRecords } from "../../db/record-import.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const recordsHandlers = {
  "records.list": (ctx, { query }) => listRecords(ctx.db, query),
  "records.create": (ctx, { body }) => createRecord(ctx.db, body),
  "records.patch": async (ctx, { params, body }) =>
    found(await updateRecord(ctx.db, params.id, body), "Record"),
  "records.delete": async (ctx, { params }) =>
    deleted(await deleteRecord(ctx.db, params.id), "Record"),
  "records.import": (ctx, { body }) => importWalletRecords(ctx.db, body.records),
} satisfies Pick<
  HandlerMap,
  "records.list" | "records.create" | "records.patch" | "records.delete" | "records.import"
>;
