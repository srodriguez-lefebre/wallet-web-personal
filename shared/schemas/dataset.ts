import { z } from "zod";

import { recordTemplateSchema } from "./templates.js";
import { id, currencySchema, uuidSchema } from "./common.js";
import { settingsSchema } from "./settings.js";
import { accountSchema } from "./accounts.js";
import { categoryEntitySchema } from "./categories.js";
import { tagSchema } from "./tags.js";
import { walletRecordResponseSchema } from "./records.js";
import {
  creditCardSchema,
  cardRecordResponseSchema,
  cardStatementResponseSchema,
  cardPaymentResponseSchema,
  paymentAllocationResponseSchema,
} from "./cards.js";
import {
  goalResponseSchema,
  goalReservationSchema,
  reservationMovementResponseSchema,
} from "./goals.js";
import { budgetSchema } from "./budgets.js";
import { exchangeRateResponseSchema } from "./rates.js";
import { investmentSchema } from "./investments.js";
import { debtSchema, recurringDebtSchema } from "./debts.js";
import { installmentPlanSchema } from "./installments.js";
import { merchantCategoryRuleSchema } from "./merchants.js";

export const walletDatasetSchema = z.object({
  recordTemplates: z.array(recordTemplateSchema.extend(id)).max(100).optional().default([]),
  settings: settingsSchema,
  accounts: z.array(accountSchema.extend(id)),
  categories: z.array(categoryEntitySchema),
  tags: z.array(tagSchema.extend(id)),
  records: z.array(walletRecordResponseSchema),
  creditCards: z.array(creditCardSchema.extend(id)),
  creditCardRecords: z.array(cardRecordResponseSchema),
  creditCardStatements: z.array(cardStatementResponseSchema),
  creditCardPayments: z.array(cardPaymentResponseSchema),
  creditCardPaymentAllocations: z.array(paymentAllocationResponseSchema),
  goals: z.array(goalResponseSchema),
  goalReservations: z.array(goalReservationSchema.extend(id)),
  goalReservationMovements: z.array(reservationMovementResponseSchema).optional(),
  budgets: z.array(budgetSchema.extend(id)),
  exchangeRates: z.array(exchangeRateResponseSchema),
  investments: z.array(investmentSchema.extend(id)),
  debts: z.array(debtSchema.safeExtend(id)),
  recurringDebts: z.array(recurringDebtSchema.extend(id)),
  installmentPlans: z.array(installmentPlanSchema.extend(id)),
});

export const backupMetadata = {
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  deletedAt: z.iso.datetime().nullable().optional(),
};

export const backupRetryMetadata = {
  idempotencyKey: z.string().nullable().optional(),
  requestHash: z.string().nullable().optional(),
};

export const walletBackupSchema = walletDatasetSchema
  .extend({
    merchantCategoryRules: z.array(merchantCategoryRuleSchema).optional(),
    recordTemplates: z
      .array(recordTemplateSchema.extend({ ...id, ...backupMetadata }))
      .max(100)
      .optional()
      .default([]),
    ingestionEvents: z
      .array(
        z.object({
          ...id,
          idempotencyKey: z.string().min(1),
          source: z.string(),
          status: z.string(),
          action: z.string().optional(),
          fingerprint: z.string().optional(),
          targetKey: z.string().optional(),
          merchantNormalized: z.string().optional(),
          amount: z.number().nonnegative().optional(),
          currency: currencySchema.optional(),
          occurredAt: z.iso.datetime().optional(),
          recordId: uuidSchema.optional(),
          creditCardRecordId: uuidSchema.optional(),
          duplicateOfId: uuidSchema.optional(),
          completedAt: z.iso.datetime().optional(),
          createdAt: z.iso.datetime(),
          updatedAt: z.iso.datetime(),
        }),
      )
      .optional(),
    merchants: z
      .array(
        z.object({
          ...id,
          ...backupMetadata,
          name: z.string().min(1),
          categoryId: uuidSchema,
          priority: z.number().int(),
          matchMode: z.enum(["alias", "exact"]).default("alias"),
          isActive: z.boolean(),
        }),
      )
      .optional(),
    merchantAliases: z
      .array(
        z.object({
          ...id,
          createdAt: backupMetadata.createdAt,
          merchantId: uuidSchema,
          alias: z.string().min(1),
          normalizedAlias: z.string().min(1),
        }),
      )
      .optional(),
    settings: settingsSchema.extend({ ...backupMetadata, id: uuidSchema.optional() }),
    accounts: z.array(accountSchema.extend({ ...id, ...backupMetadata })),
    categories: z.array(categoryEntitySchema.extend(backupMetadata)),
    tags: z.array(tagSchema.extend({ ...id, ...backupMetadata })),
    records: z.array(
      walletRecordResponseSchema.safeExtend({ ...backupMetadata, ...backupRetryMetadata }),
    ),
    goals: z.array(goalResponseSchema.safeExtend(backupMetadata)),
    creditCards: z.array(creditCardSchema.extend({ ...id, ...backupMetadata })),
    creditCardRecords: z.array(cardRecordResponseSchema.safeExtend(backupMetadata)),
    creditCardPayments: z.array(
      z.object({ ...cardPaymentResponseSchema.shape, ...backupMetadata, ...backupRetryMetadata }),
    ),
    creditCardStatements: z.array(cardStatementResponseSchema.extend(backupMetadata)),
    creditCardPaymentAllocations: z.array(paymentAllocationResponseSchema.extend(backupMetadata)),
    goalReservations: z.array(
      goalReservationSchema.extend({ ...id, ...backupMetadata, createdAt: z.iso.datetime() }),
    ),
    goalReservationMovements: z
      .array(
        reservationMovementResponseSchema.extend({
          ...backupMetadata,
          createdAt: z.iso.datetime(),
          idempotencyKey: z.string().nullable().optional(),
        }),
      )
      .optional(),
    budgets: z.array(budgetSchema.extend({ ...id, ...backupMetadata })),
    exchangeRates: z.array(exchangeRateResponseSchema.extend(backupMetadata)),
    investments: z.array(investmentSchema.extend({ ...id, ...backupMetadata })),
    debts: z.array(debtSchema.safeExtend({ ...id, ...backupMetadata })),
    recurringDebts: z.array(recurringDebtSchema.extend({ ...id, ...backupMetadata })),
    installmentPlans: z.array(installmentPlanSchema.extend({ ...id, ...backupMetadata })),
  })
  .superRefine((dataset, ctx) => {
    const ids = new Map<string, Set<string>>();
    for (const [name, rows] of Object.entries(dataset)) {
      if (!Array.isArray(rows)) continue;
      const keys = rows.map((row) => row.id);
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({ code: "custom", path: [name], message: "Duplicate IDs in backup" });
      ids.set(name, new Set(keys));
    }
    const reference = (
      collection: string,
      value: string | undefined,
      path: (string | number)[],
    ) => {
      if (value && !ids.get(collection)?.has(value))
        ctx.addIssue({ code: "custom", path, message: `Missing ${collection} reference` });
    };
    dataset.recordTemplates.forEach((template, index) => {
      for (const key of ["accountId", "destinationAccountId"] as const)
        reference("accounts", template[key], ["recordTemplates", index, key]);
      reference("creditCards", template.creditCardId, ["recordTemplates", index, "creditCardId"]);
      reference("categories", template.categoryId, ["recordTemplates", index, "categoryId"]);
      reference("tags", template.tagId, ["recordTemplates", index, "tagId"]);
    });
    dataset.records.forEach((record, index) => {
      for (const key of ["accountId", "destinationAccountId"] as const)
        reference("accounts", record[key], ["records", index, key]);
      reference("categories", record.categoryId, ["records", index, "categoryId"]);
      reference("creditCards", record.creditCardId, ["records", index, "creditCardId"]);
      // Historical debt IDs can outlive deleted debt metadata; records.debt_id has no FK.
      record.tagIds.forEach((value) => reference("tags", value, ["records", index, "tagIds"]));
      record.goalAssociations.forEach((value) =>
        reference("goals", value.goalId, ["records", index, "goalAssociations"]),
      );
      record.goalIds.forEach((value) => reference("goals", value, ["records", index, "goalIds"]));
    });
    if ((dataset.merchants === undefined) !== (dataset.merchantAliases === undefined))
      ctx.addIssue({
        code: "custom",
        path: ["merchants"],
        message: "Backup must include both merchant collections",
      });
    dataset.merchants?.forEach((merchant, index) =>
      reference("categories", merchant.categoryId, ["merchants", index, "categoryId"]),
    );
    dataset.merchantAliases?.forEach((alias, index) =>
      reference("merchants", alias.merchantId, ["merchantAliases", index, "merchantId"]),
    );
    dataset.ingestionEvents?.forEach((event, index) => {
      reference("records", event.recordId, ["ingestionEvents", index, "recordId"]);
      reference("creditCardRecords", event.creditCardRecordId, [
        "ingestionEvents",
        index,
        "creditCardRecordId",
      ]);
      reference("ingestionEvents", event.duplicateOfId, [
        "ingestionEvents",
        index,
        "duplicateOfId",
      ]);
    });
  });
