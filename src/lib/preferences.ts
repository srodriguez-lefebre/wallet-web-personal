import type { SettingsPatch } from "../../shared/schemas";
import type { WalletDataset, WalletSettings } from "../../shared/types";

export function resolveTheme(
  theme: WalletSettings["theme"],
  systemDark: boolean,
): "dark" | "light" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function paymentDefaults(method: string): SettingsPatch {
  return method.startsWith("card:")
    ? { defaultPaymentType: "credit", defaultCreditCardId: method.slice(5) }
    : {
        defaultPaymentType: method as WalletSettings["defaultPaymentType"],
        defaultCreditCardId: null,
      };
}

/** An explicit account selection overrides the general hidden-account preference. */
export function reportDataset(
  dataset: WalletDataset,
  selectedAccountId?: string,
): WalletDataset {
  if (!selectedAccountId && dataset.settings.includeHiddenAccountsInReports)
    return dataset;
  const accounts = dataset.accounts.filter((a) =>
    selectedAccountId ? a.id === selectedAccountId : a.isVisible,
  );
  const ids = new Set(accounts.map((a) => a.id));
  return {
    ...dataset,
    accounts,
    records: dataset.records.filter(
      (r) =>
        (!selectedAccountId && !r.accountId && !r.destinationAccountId) ||
        (r.accountId && ids.has(r.accountId)) ||
        (r.destinationAccountId && ids.has(r.destinationAccountId)),
    ),
    budgets: dataset.budgets.filter(
      (b) => !b.accountId || ids.has(b.accountId),
    ),
  };
}
