import { bootstrapWallet, getWalletBackup, getWalletDataset } from "../../db/index.js";
import { restoreWalletBackup } from "../../db/wallet-restore.js";

import type { HandlerMap } from "../handler-types.js";
export const walletHandlers = {
  "health.get": () => ({ ok: true, service: "wallet-web-personal" }),
  "wallet.get": (ctx) => getWalletDataset(ctx.db),
  "wallet.backup": (ctx) => getWalletBackup(ctx.db),
  "wallet.restore": (ctx, { body }) => restoreWalletBackup(ctx.db, body),
  "wallet.bootstrap": async (ctx, { body }) => {
    const startedAt = performance.now();
    const result = await bootstrapWallet(ctx.db, body);
    ctx.setHeader("Server-Timing", `bootstrap;dur=${(performance.now() - startedAt).toFixed(1)}`);
    return result;
  },
} satisfies Pick<
  HandlerMap,
  "health.get" | "wallet.get" | "wallet.backup" | "wallet.restore" | "wallet.bootstrap"
>;
