import { createAccount, deleteAccount, listAccounts, updateAccount } from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const accountsHandlers = {
  "accounts.list": (ctx) => listAccounts(ctx.db),
  "accounts.create": (ctx, { body }) => createAccount(ctx.db, body),
  "accounts.patch": async (ctx, { params, body }) =>
    found(await updateAccount(ctx.db, params.id, body), "Account"),
  "accounts.delete": async (ctx, { params }) =>
    deleted(await deleteAccount(ctx.db, params.id), "Account"),
} satisfies Pick<
  HandlerMap,
  "accounts.list" | "accounts.create" | "accounts.patch" | "accounts.delete"
>;
