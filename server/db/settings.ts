import { eq, sql } from "drizzle-orm";

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

export async function upsertSettings(db: Db, input: WalletSettings) {
  const existing = await db.select().from(settings).limit(1);
  if (existing[0] && input.primaryCurrency !== existing[0].primaryCurrency) {
    const [history] = await db.select({ id: records.id }).from(records).limit(1);
    if (history)
      throw validationError(
        "La moneda principal no puede cambiar mientras exista historial financiero. Exportá tus datos antes de crear una billetera con otra moneda.",
      );
  }
  const values = {
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
  const [row] =
    existing.length > 0
      ? await db.update(settings).set(values).where(eq(settings.id, existing[0]!.id)).returning()
      : await db.insert(settings).values(values).returning();
  return mapSettings(row);
}

export async function patchSettings(db: Db, input: SettingsPatch) {
  const [current] = await db.select().from(settings).limit(1);
  if (!current) {
    const merged = settingsSchema.parse({
      ...mapSettings(undefined),
      ...input,
      primaryAccountId: input.primaryAccountId === null ? undefined : input.primaryAccountId,
      defaultAccountId: input.defaultAccountId === null ? undefined : input.defaultAccountId,
      defaultCreditCardId:
        input.defaultCreditCardId === null ? undefined : input.defaultCreditCardId,
    });
    return upsertSettings(db, merged);
  }
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
    .update(settings)
    .set(values)
    .where(eq(settings.id, current.id))
    .returning();
  return mapSettings(row);
}
