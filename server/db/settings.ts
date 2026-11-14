import { sql } from "drizzle-orm";

import { type SettingsPatch, settingsSchema } from "../../shared/schemas.js";
import { validationError } from "../api/errors.js";
import { mapSettings } from "./mappers.js";
import { hasOwn } from "./patch.js";
import { records, settings } from "./schema.js";

import type { WalletSettings } from "../../shared/types.js";
import type { Db } from "./input-types.js";

export async function getSettings(db: Db) {
  const rows = await db.select().from(settings).limit(1);
  return mapSettings(rows[0]);
}

function settingsValues(input: WalletSettings) {
  return {
    primaryCurrency: input.primaryCurrency,
    primaryAccountId: input.primaryAccountId ?? null,
    theme: input.theme,
    defaultDashboardPreset: input.defaultDashboardPreset,
    locale: input.locale,
    includeHiddenAccountsInReports: input.includeHiddenAccountsInReports,
    defaultAccountId: input.defaultAccountId ?? null,
    defaultPaymentType: input.defaultPaymentType,
    defaultCreditCardId: input.defaultCreditCardId ?? null,
    defaultPaymentStatus: input.defaultPaymentStatus,
    reviewSeenThrough: input.reviewSeenThrough
      ? new Date(Math.min(Date.parse(input.reviewSeenThrough), Date.now()))
      : undefined,
    updatedAt: new Date(),
  };
}
function currencyGuard(currency: string | undefined) {
  return currency === undefined
    ? undefined
    : sql`${settings.primaryCurrency}=${currency} OR NOT EXISTS (SELECT 1 FROM ${records})`;
}
function requireSettingsRow(row: typeof settings.$inferSelect | undefined) {
  if (!row)
    throw validationError(
      "La moneda principal no puede cambiar mientras exista historial financiero. Exportá tus datos antes de crear una billetera con otra moneda.",
    );
  return mapSettings(row);
}
export async function upsertSettings(db: Db, input: WalletSettings) {
  const values = settingsValues(input);
  const [row] = await db
    .insert(settings)
    .values(values)
    .onConflictDoUpdate({
      target: settings.singleton,
      set: values,
      setWhere: currencyGuard(input.primaryCurrency),
    })
    .returning();
  return requireSettingsRow(row);
}

export async function patchSettings(db: Db, input: SettingsPatch) {
  const [current] = await db.select().from(settings).limit(1);
  const merged = settingsSchema.parse({
    ...mapSettings(current),
    ...input,
    primaryAccountId: hasOwn(input, "primaryAccountId")
      ? (input.primaryAccountId ?? undefined)
      : (current?.primaryAccountId ?? undefined),
    defaultAccountId: hasOwn(input, "defaultAccountId")
      ? (input.defaultAccountId ?? undefined)
      : (current?.defaultAccountId ?? undefined),
    defaultCreditCardId: hasOwn(input, "defaultCreditCardId")
      ? (input.defaultCreditCardId ?? undefined)
      : (current?.defaultCreditCardId ?? undefined),
  });
  const values: Partial<typeof settings.$inferInsert> = { updatedAt: new Date() };
  if (input.reviewSeenThrough) {
    values.reviewSeenThrough =
      sql`greatest(${settings.reviewSeenThrough}, least(${input.reviewSeenThrough}::timestamptz, now()))` as unknown as Date;
  }
  for (const key of [
    "primaryCurrency",
    "theme",
    "defaultDashboardPreset",
    "locale",
    "includeHiddenAccountsInReports",
    "defaultPaymentType",
    "defaultPaymentStatus",
  ] as const) {
    if (hasOwn(input, key)) values[key] = input[key] as never;
  }
  if (hasOwn(input, "primaryAccountId")) values.primaryAccountId = input.primaryAccountId ?? null;
  if (hasOwn(input, "defaultAccountId")) values.defaultAccountId = input.defaultAccountId ?? null;
  if (hasOwn(input, "defaultCreditCardId")) {
    values.defaultCreditCardId = input.defaultCreditCardId ?? null;
  }
  const [row] = await db
    .insert(settings)
    .values(settingsValues(merged))
    .onConflictDoUpdate({
      target: settings.singleton,
      set: values,
      setWhere: currencyGuard(input.primaryCurrency),
    })
    .returning();
  return requireSettingsRow(row);
}
