import { expect, test } from "vitest";
import { paymentDefaults, reportDataset, resolveTheme } from "./preferences";
import { mockWalletData } from "../../shared/mock-data";
test("choosing debit explicitly clears the old card in JSON", () => {
  expect(JSON.parse(JSON.stringify(paymentDefaults("debit")))).toEqual({
    defaultPaymentType: "debit",
    defaultCreditCardId: null,
  });
});
test("system theme follows operating system preference", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});
test("hidden accounts are excluded from reports unless opted in or explicitly selected", () => {
  const data = structuredClone(mockWalletData);
  data.settings.includeHiddenAccountsInReports = false;
  const hidden = data.accounts.find((a) => !a.isVisible)!;
  data.records.push({
    ...data.records[0],
    id: "hidden-report",
    accountId: hidden.id,
  });
  expect(
    reportDataset(data).records.some((r) => r.id === "hidden-report"),
  ).toBe(false);
  expect(
    reportDataset(data, hidden.id).records.some(
      (r) => r.id === "hidden-report",
    ),
  ).toBe(true);
  data.settings.includeHiddenAccountsInReports = true;
  expect(
    reportDataset(data).records.some((r) => r.id === "hidden-report"),
  ).toBe(true);
});
