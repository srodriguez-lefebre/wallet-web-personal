import { and, eq, isNull, sql } from "drizzle-orm";

import { conflictError, notFoundError, validationError } from "../../api/errors.js";
import { accounts, cardMailSettings, creditCards } from "../schema.js";

import type { CardMailSettings } from "../../../shared/schemas/card-mail-settings.js";
import type { DbClient } from "../client.js";

export async function cardMailSettingsAvailable(db: DbClient) {
  const { rows } = await db.execute<{ available: boolean }>(
    sql`SELECT to_regclass('card_mail_settings') IS NOT NULL AS available`,
  );
  return rows[0]?.available === true;
}

async function requireCard(db: DbClient, id: string) {
  const [card] = await db
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(and(eq(creditCards.id, id), isNull(creditCards.deletedAt)));
  if (!card) throw notFoundError("Credit card");
}

export async function getCardMailSettings(db: DbClient, id: string) {
  await requireCard(db, id);
  const available = await cardMailSettingsAvailable(db);
  if (!available) return { available, settings: null };
  const [row] = await db.select().from(cardMailSettings).where(eq(cardMailSettings.id, id));
  return {
    available,
    settings: row
      ? {
          source: row.source,
          alias: row.alias,
          accountId: row.accountId,
          rateProfile: row.rateProfile,
        }
      : null,
  };
}

export async function replaceCardMailSettings(
  db: DbClient,
  id: string,
  settings: CardMailSettings | null,
) {
  await requireCard(db, id);
  if (!(await cardMailSettingsAvailable(db)))
    throw conflictError("Bank notice settings require the database migration");
  if (!settings) {
    await db.delete(cardMailSettings).where(eq(cardMailSettings.id, id));
    return { available: true, settings: null };
  }
  if (settings.accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, settings.accountId),
          eq(accounts.isActive, true),
          isNull(accounts.deletedAt),
        ),
      );
    if (!account) throw validationError("Select an active account");
  }
  await db
    .insert(cardMailSettings)
    .values({ id, ...settings })
    .onConflictDoUpdate({
      target: cardMailSettings.id,
      set: settings,
    });
  return { available: true, settings };
}
