import { z } from "zod";

import { uuidSchema } from "./common.js";

export const bankExchangeRateProfiles = [
  "reference",
  "itau_link",
  "itau_board",
  "brou_ebrou",
  "brou_board",
  "santander_supernet",
  "santander_board",
] as const;
export const bankExchangeRateProfileSchema = z.enum(bankExchangeRateProfiles);
export type BankExchangeRateProfile = z.infer<typeof bankExchangeRateProfileSchema>;

export const cardMailSettingsSchema = z.strictObject({
  source: z.string().trim().min(1).max(100),
  alias: z.string().trim().max(200).default(""),
  accountId: uuidSchema.nullable(),
  rateProfile: bankExchangeRateProfileSchema,
});
export type CardMailSettings = z.infer<typeof cardMailSettingsSchema>;

export const cardMailSettingsInputSchema = z.strictObject({
  settings: cardMailSettingsSchema.nullable(),
});
export const cardMailSettingsResponseSchema = cardMailSettingsInputSchema.extend({
  available: z.boolean(),
});
