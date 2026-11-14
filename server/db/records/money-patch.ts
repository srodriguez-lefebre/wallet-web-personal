import { eq, inArray, sql } from "drizzle-orm";

import { type RecordPatch } from "../../../shared/schemas.js";
import { validationError } from "../../api/errors.js";
import { getExchangeRate } from "../fx.js";
import { toNumeric } from "../mappers.js";
import { hasOwn } from "../patch.js";
import { accounts, creditCards, settings } from "../schema.js";

import type { Account, WalletRecord } from "../../../shared/types.js";
import type { Db } from "../input-types.js";

export async function normalizeRecordMoneyPatch(
  db: Db,
  current: WalletRecord,
  patch: RecordPatch,
): Promise<RecordPatch> {
  const amount = patch.amount ?? current.amount;
  const currency = patch.currency ?? current.currency;
  const accountId = patch.accountId ?? current.accountId;
  const destinationAccountId = hasOwn(patch, "destinationAccountId")
    ? (patch.destinationAccountId ?? undefined)
    : current.destinationAccountId;
  const cardId = hasOwn(patch, "creditCardId")
    ? (patch.creditCardId ?? undefined)
    : current.creditCardId;
  const amountChanged = amount !== current.amount;
  const currencyChanged = currency !== current.currency;
  const sourceChanged = accountId !== current.accountId;
  const destinationChanged = destinationAccountId !== current.destinationAccountId;
  const cardChanged = cardId !== current.creditCardId;
  const limitRateChanged = hasOwn(patch, "exchangeRateToLimitCurrency");
  if (
    !amountChanged &&
    !currencyChanged &&
    !sourceChanged &&
    !destinationChanged &&
    !cardChanged &&
    !limitRateChanged
  )
    return patch;
  const normalized = { ...patch };
  const accountIds = [accountId, destinationAccountId].filter((id): id is string => Boolean(id));
  const [accountRows, [settingsRow], [card]] = await db.batch([
    db.select().from(accounts).where(inArray(accounts.id, accountIds)),
    db.select().from(settings).limit(1),
    db
      .select()
      .from(creditCards)
      .where(eq(creditCards.id, cardId ?? "00000000-0000-0000-0000-000000000000"))
      .limit(1),
  ]);
  const date = patch.occurredAt ?? current.occurredAt;
  const convertedAmount = async (
    id: string | undefined,
    previousId: string | undefined,
    previousAmount: number | undefined,
  ) => {
    if (!id) return undefined;
    const account = accountRows.find((row) => row.id === id);
    if (!account) throw validationError("Account does not exist");
    if (account.currency === currency) return amount;
    // Amount edits retain the conversion agreed when the transaction was recorded.
    const rate =
      !currencyChanged && id === previousId && previousAmount !== undefined
        ? null
        : await getExchangeRate(db, currency, account.currency as Account["currency"], date);
    const expression =
      !currencyChanged && id === previousId && previousAmount !== undefined
        ? sql`${toNumeric(amount)}::numeric * ${toNumeric(previousAmount)}::numeric / ${toNumeric(current.amount)}::numeric`
        : (() => {
            if (rate === null)
              throw validationError("An exchange rate is required for the account currency");
            return sql`${toNumeric(amount)}::numeric * ${toNumeric(rate)}::numeric`;
          })();
    const result = await db.execute(sql`select round(${expression}, 2) as amount`);
    return Number(
      (
        result.rows[0] as {
          amount: string;
        }
      ).amount,
    );
  };
  if (!hasOwn(patch, "accountAmount") && (amountChanged || currencyChanged || sourceChanged)) {
    normalized.accountAmount = await convertedAmount(
      accountId,
      current.accountId,
      current.accountAmount,
    );
  }
  if (
    !hasOwn(patch, "destinationAmount") &&
    (amountChanged || currencyChanged || destinationChanged)
  ) {
    normalized.destinationAmount = await convertedAmount(
      destinationAccountId,
      current.destinationAccountId,
      current.destinationAmount,
    );
  }
  if (currencyChanged && !hasOwn(patch, "exchangeRateToPrimary")) {
    const rate = await getExchangeRate(
      db,
      currency,
      (settingsRow?.primaryCurrency ?? "UYU") as WalletRecord["currency"],
      date,
    );
    if (rate === null)
      throw validationError("An exchange rate is required for the primary currency");
    normalized.exchangeRateToPrimary = rate;
  }
  if (cardId && (amountChanged || currencyChanged || cardChanged || limitRateChanged)) {
    if (!card) throw validationError("Credit card does not exist");
    const rate =
      patch.exchangeRateToLimitCurrency ??
      (!currencyChanged && !cardChanged ? current.exchangeRateToLimitCurrency : undefined) ??
      (await getExchangeRate(db, currency, card.limitCurrency as WalletRecord["currency"], date));
    if (rate === null)
      throw validationError("An exchange rate is required for the card limit currency");
    const result = await db.execute(sql`select round(${toNumeric(rate)}::numeric, 6) as rate,
      round(${toNumeric(amount)}::numeric * round(${toNumeric(rate)}::numeric, 6), 2) as amount`);
    const converted = result.rows[0] as {
      rate: string;
      amount: string;
    };
    normalized.exchangeRateToLimitCurrency = Number(converted.rate);
    if (!hasOwn(patch, "amountInLimitCurrency"))
      normalized.amountInLimitCurrency = Number(converted.amount);
  }
  return normalized;
}
