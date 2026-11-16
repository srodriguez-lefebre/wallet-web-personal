import { z } from "zod";

import { compatibleMailSourceSchema } from "../mail-source.js";
import { nonnegativeMoneySchema, currencySchema, optionalUuidSchema } from "./common.js";

export const mailIngestionSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(300),
    integration: z.object({
      name: z.string().min(1).max(100),
      version: z.string().min(1).max(100),
    }),
    email: z.object({
      provider: z.literal("gmail"),
      messageId: z.string().min(1).max(300),
      threadId: z.string().min(1).max(300),
      subject: z.string().max(500).default(""),
      from: z.string().max(500).default(""),
      date: z.iso.datetime(),
    }),
    transaction: z.object({
      source: compatibleMailSourceSchema,
      sourceLabel: z.string().max(100).default(""),
      occurredAt: z.iso.datetime(),
      amount: nonnegativeMoneySchema,
      currency: currencySchema,
      merchantRaw: z.string().min(1).max(500),
      cardAlias: z.string().max(200).default(""),
      cardBrand: z.string().max(100).default(""),
      cardNumber: z.string().max(100).default(""),
      paymentType: z.enum(["credit_card", "debit", "transfer"]),
      accountNumber: z.string().max(100).optional(),
      destinationAccountNumber: z.string().max(100).optional(),
      destinationBank: z.string().max(200).optional(),
    }),
    destination: z
      .object({
        accountId: optionalUuidSchema,
        creditCardId: optionalUuidSchema,
        destinationAccountId: optionalUuidSchema,
      })
      .default({}),
  })
  .superRefine((value, context) => {
    if (value.transaction.paymentType !== "credit_card" && value.destination.creditCardId) {
      context.addIssue({
        code: "custom",
        path: ["destination", "creditCardId"],
        message: "Bank notices cannot be assigned to a credit card",
      });
    }
    if (value.destination.destinationAccountId) {
      if (value.transaction.paymentType !== "transfer" || !value.destination.accountId) {
        context.addIssue({
          code: "custom",
          path: ["destination", "destinationAccountId"],
          message: "An owned transfer requires a source bank account",
        });
      }
      if (value.destination.destinationAccountId === value.destination.accountId) {
        context.addIssue({
          code: "custom",
          path: ["destination", "destinationAccountId"],
          message: "Transfer accounts must be different",
        });
      }
    }
  });

export type MailIngestionInput = z.infer<typeof mailIngestionSchema>;
