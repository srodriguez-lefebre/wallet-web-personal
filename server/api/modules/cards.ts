import { getCreditCardSummary } from "../../db/cards/summary.js";
import {
  archiveCreditCard,
  createCreditCard,
  createCreditCardPayment,
  createCreditCardRecord,
  deleteCreditCardPayment,
  deleteCreditCardRecord,
  ensureCreditCardStatements,
  listCreditCardRecords,
  listCreditCards,
  listCreditCardStatements,
  payCreditCardStatement,
  updateCreditCard,
  updateCreditCardRecord,
} from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const cardsHandlers = {
  "cards.refreshStatements": async (ctx) => {
    await ensureCreditCardStatements(ctx.db);
    return { refreshed: true };
  },
  "cards.list": (ctx) => listCreditCards(ctx.db),
  "cards.create": (ctx, { body }) => createCreditCard(ctx.db, body),
  "cards.patch": async (ctx, { params, body }) =>
    found(await updateCreditCard(ctx.db, params.id, body), "Credit card"),
  "cards.delete": async (ctx, { params }) => {
    deleted(await archiveCreditCard(ctx.db, params.id), "Credit card");
    return { archived: true };
  },
  "cards.summary": async (ctx, { params }) =>
    found(await getCreditCardSummary(ctx.db, params.id, ctx.now), "Credit card"),
  "cardRecords.list": (ctx, { params }) => listCreditCardRecords(ctx.db, params.id),
  "cardRecords.create": (ctx, { params, body }) => createCreditCardRecord(ctx.db, params.id, body),
  "cardRecords.patch": async (ctx, { params, body }) =>
    found(await updateCreditCardRecord(ctx.db, params.id, params.recordId, body), "Card movement"),
  "cardRecords.delete": async (ctx, { params }) =>
    deleted(await deleteCreditCardRecord(ctx.db, params.id, params.recordId), "Card movement"),
  "cardRecords.refund": (ctx, { params, body }) =>
    createCreditCardRecord(ctx.db, params.id, { ...body, kind: "refund" }),
  "cardPayments.create": (ctx, { params, body }) =>
    createCreditCardPayment(ctx.db, params.id, body),
  "cardPayments.delete": async (ctx, { params }) =>
    deleted(await deleteCreditCardPayment(ctx.db, params.id, params.paymentId), "Payment"),
  "cardStatements.list": (ctx, { params }) => listCreditCardStatements(ctx.db, params.id),
  "cardStatements.pay": (ctx, { params, body }) =>
    payCreditCardStatement(ctx.db, params.id, params.statementId, body),
} satisfies Pick<
  HandlerMap,
  | "cards.refreshStatements"
  | "cards.list"
  | "cards.create"
  | "cards.patch"
  | "cards.delete"
  | "cards.summary"
  | "cardRecords.list"
  | "cardRecords.create"
  | "cardRecords.patch"
  | "cardRecords.delete"
  | "cardRecords.refund"
  | "cardPayments.create"
  | "cardPayments.delete"
  | "cardStatements.list"
  | "cardStatements.pay"
>;
