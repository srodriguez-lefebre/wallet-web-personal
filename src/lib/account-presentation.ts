import type { AccountBalance, CurrencyCode } from "@shared/types";

export interface CurrencyLiquidity {
  currency: CurrencyCode;
  total: number;
  reserved: number;
  free: number;
  accountCount: number;
}

/** Original-currency liquidity of active, visible cash/bank/savings accounts.
 * Pass balances only after complete history has loaded; no FX totals are mixed.
 */
export function groupAccountLiquidity(
  balances: AccountBalance[],
): CurrencyLiquidity[] {
  const groups = new Map<CurrencyCode, CurrencyLiquidity>();
  for (const { account, totalBalance, reserved, freeBalance } of balances) {
    if (
      !account.isActive ||
      !account.isVisible ||
      account.type === "credit_card" ||
      account.type === "investment"
    )
      continue;
    const group = groups.get(account.currency) ?? {
      currency: account.currency,
      total: 0,
      reserved: 0,
      free: 0,
      accountCount: 0,
    };
    group.total += totalBalance;
    group.reserved += reserved;
    group.free += freeBalance;
    group.accountCount += 1;
    groups.set(account.currency, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}
