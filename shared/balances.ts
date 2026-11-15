import { endOfMonth, parseISO, endOfDay, isAfter } from "date-fns";

import { isFinancialRecord } from "./record-status.js";
import { findExchangeRate } from "./money.js";
import { creditCardBankReservationRelease } from "./cards.js";

import type { WalletRecord, Account, WalletDataset, AccountBalance } from "./types.js";

export function recordAmountForAccount(
  record: WalletRecord,
  account: Account,
  destination: boolean,
) {
  const frozenAmount = destination ? record.destinationAmount : record.accountAmount;
  if (frozenAmount !== undefined)
    return Number.isFinite(frozenAmount) && frozenAmount > 0 ? frozenAmount : 0;
  return record.currency === account.currency ? record.amount : 0;
}

export function calculateAccountBalances(
  dataset: WalletDataset,
  now: Date,
  cutoff?: Date,
): AccountBalance[] {
  return dataset.accounts.map((account) => {
    const recordBalance = dataset.records.reduce((total, record) => {
      if (!isFinancialRecord(record) || (cutoff && isAfter(parseISO(record.occurredAt), cutoff)))
        return total;

      if (record.type === "income" && record.accountId === account.id) {
        return total + recordAmountForAccount(record, account, false);
      }

      if (record.type === "expense" && record.accountId === account.id) {
        return total - recordAmountForAccount(record, account, false);
      }

      if (record.type === "transfer") {
        if (record.accountId === account.id)
          return total - recordAmountForAccount(record, account, false);
        if (record.destinationAccountId === account.id)
          return total + recordAmountForAccount(record, account, true);
      }

      return total;
    }, account.initialBalance);

    const directCardBalance = dataset.creditCardRecords.reduce((total, movement) => {
      if (
        (cutoff && isAfter(parseISO(movement.occurredAt), cutoff)) ||
        movement.walletRecordId ||
        !movement.accountImpactAtCreation ||
        movement.accountId !== account.id ||
        movement.accountAmount === undefined
      )
        return total;
      return (
        total + (movement.kind === "refund" ? movement.accountAmount : -movement.accountAmount)
      );
    }, recordBalance);

    const totalBalance = dataset.creditCardPayments.reduce(
      (total, payment) => {
        if (
          (cutoff && isAfter(parseISO(payment.occurredAt), cutoff)) ||
          payment.accountId !== account.id ||
          payment.accountAmount === undefined
        ) {
          return total;
        }
        return total - payment.accountAmount;
      },
      directCardBalance + creditCardBankReservationRelease(dataset, account.id, cutoff),
    );

    const movements = dataset.goalReservationMovements ?? [];
    const reserved =
      cutoff && movements.length
        ? movements.reduce((total, movement) => {
            if (movement.accountId !== account.id || isAfter(parseISO(movement.createdAt), cutoff))
              return total;
            return (
              total +
              (movement.type === "reserve" || movement.type === "restore" ? 1 : -1) *
                movement.amount
            );
          }, 0)
        : dataset.goalReservations
            .filter(
              (reservation) =>
                reservation.accountId === account.id &&
                (!cutoff || !isAfter(parseISO(reservation.createdAt), cutoff)),
            )
            .reduce((total, reservation) => total + reservation.amount, 0);
    const freeBalance = totalBalance - reserved;

    const balanceInPrimary = convertAccountBalanceToPrimary(account, freeBalance, dataset, now);
    const totalBalanceInPrimary = convertAccountBalanceToPrimary(
      account,
      totalBalance,
      dataset,
      now,
    );

    return {
      account,
      balance: freeBalance,
      totalBalance,
      balanceInPrimary,
      totalBalanceInPrimary,
      reserved,
      freeBalance,
    };
  });
}

export function calculateAccountBalanceAtMonthEnd(
  dataset: WalletDataset,
  accountId: string,
  month: string,
) {
  return calculateAccountBalanceAtCutoff(
    dataset,
    accountId,
    endOfMonth(parseISO(`${month}-15T12:00:00.000Z`)),
  );
}

export function calculateAccountBalanceAtDate(
  dataset: WalletDataset,
  accountId: string,
  date: string,
) {
  return calculateAccountBalanceAtCutoff(
    dataset,
    accountId,
    endOfDay(parseISO(`${date}T12:00:00.000Z`)),
  );
}

export function calculateAccountBalanceAtCutoff(
  dataset: WalletDataset,
  accountId: string,
  cutoff: Date,
) {
  return (
    calculateAccountBalances(dataset, cutoff, cutoff).find((item) => item.account.id === accountId)
      ?.freeBalance ?? 0
  );
}

export function convertAccountBalanceToPrimary(
  account: Account,
  balance: number,
  dataset: WalletDataset,
  now: Date,
) {
  if (account.currency === dataset.settings.primaryCurrency) return balance;

  const rate = findExchangeRate(
    dataset.exchangeRates,
    account.currency,
    dataset.settings.primaryCurrency,
    now,
  );
  return rate === null ? Number.NaN : balance * rate;
}

export function calculateVisibleBalance(dataset: WalletDataset, now: Date) {
  return calculateAccountBalances(dataset, now)
    .filter(({ account }) => account.isVisible)
    .reduce((total, item) => total + item.balanceInPrimary, 0);
}
