import { and, eq, isNull, notExists, or } from "drizzle-orm";

import { normalizeCardAlias, cardLastFour } from "../../shared/mail-normalization.js";
import { cardMailSettingsAvailable } from "../db/cards/mail-settings.js";
import { cardMailSettings, creditCards } from "../db/schema.js";

import type { BankExchangeRateProfile } from "../../shared/schemas/card-mail-settings.js";
import type { MailIngestionInput } from "../../shared/schemas.js";
import type { DbClient } from "../db/client.js";

interface Routing {
  destination: MailIngestionInput["destination"];
  rateProfile?: BankExchangeRateProfile;
  warning?: string;
}

export async function routeCardNotice(db: DbClient, input: MailIngestionInput): Promise<Routing> {
  const legacy = input.destination;
  const lastFour = cardLastFour(input.transaction.cardNumber);
  const alias = normalizeCardAlias(input.transaction.cardAlias);
  if (!lastFour && !alias && !legacy.creditCardId) return { destination: legacy };

  const available = await cardMailSettingsAvailable(db);
  const activeCard = and(isNull(creditCards.deletedAt), eq(creditCards.isActive, true));
  if (available) {
    const candidates = await db
      .select({
        id: cardMailSettings.id,
        accountId: cardMailSettings.accountId,
        alias: cardMailSettings.alias,
        source: cardMailSettings.source,
        lastFour: creditCards.lastFour,
        rateProfile: cardMailSettings.rateProfile,
      })
      .from(cardMailSettings)
      .innerJoin(creditCards, eq(creditCards.id, cardMailSettings.id))
      .where(
        and(
          activeCard,
          or(
            legacy.creditCardId ? eq(cardMailSettings.id, legacy.creditCardId) : undefined,
            lastFour || alias
              ? and(
                  eq(cardMailSettings.source, input.transaction.source),
                  lastFour ? eq(creditCards.lastFour, lastFour) : undefined,
                )
              : undefined,
          ),
        ),
      );
    const matches = candidates.filter(
      (rule) =>
        rule.source === input.transaction.source &&
        (lastFour
          ? rule.lastFour === lastFour
          : Boolean(alias) && normalizeCardAlias(rule.alias) === alias),
    );
    const [match] = matches;
    if (matches.length > 1 || (match && legacy.creditCardId && legacy.creditCardId !== match.id))
      return {
        destination: {},
        warning: "Conflicting card assignments; select the correct card before confirming.",
      };
    const rule = match ?? candidates.find(({ id }) => id === legacy.creditCardId);
    if (rule)
      return {
        destination: { creditCardId: rule.id, accountId: rule.accountId ?? undefined },
        rateProfile: rule.rateProfile,
      };
  }

  if (legacy.creditCardId || !lastFour) return { destination: legacy };
  const candidates = await db
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(
      and(
        activeCard,
        eq(creditCards.lastFour, lastFour),
        available
          ? notExists(
              db
                .select({ id: cardMailSettings.id })
                .from(cardMailSettings)
                .where(eq(cardMailSettings.id, creditCards.id)),
            )
          : undefined,
      ),
    )
    .limit(2);
  if (candidates.length > 1)
    return {
      destination: {},
      warning:
        "Multiple cards have these last four digits; select the correct card before confirming.",
    };
  return { destination: { ...legacy, creditCardId: candidates[0]?.id } };
}
