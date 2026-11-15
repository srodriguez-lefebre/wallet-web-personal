import { z } from "zod";

export const currencySchema = z.enum(["UYU", "USD", "EUR", "BRL", "ARS"]);

export const uuidSchema = z.uuid("Invalid UUID");

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const recordTypeSchema = z.enum(["expense", "income", "transfer"]);

export const paymentTypeSchema = z.enum(["cash", "debit", "credit", "transfer", "other"]);

export const paymentStatusSchema = z.enum(["cleared", "pending", "needs_review", "cancelled"]);

export const debtDirectionSchema = z.enum(["payable", "receivable"]);

export const debtStatusSchema = z.enum(["active", "paid", "paused"]);

export function nonEmptyPatch<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape)
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "Patch must contain at least one field",
    });
}

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

export const optionalUuidSchema = uuidSchema.optional();

export const id = { id: uuidSchema };
