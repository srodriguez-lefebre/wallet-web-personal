export function normalizeMerchantTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cardLastFour(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

export function merchantTokenSequenceMatch(
  merchantRaw: string,
  aliasRaw: string,
) {
  const merchantTokens = normalizeMerchantTerm(merchantRaw).split(" ").filter(Boolean);
  const aliasTokens = normalizeMerchantTerm(aliasRaw).split(" ").filter(Boolean);
  if (aliasTokens.length === 0 || aliasTokens.length > merchantTokens.length)
    return false;

  return merchantTokens.some((_, index) =>
    aliasTokens.every(
      (aliasToken, offset) => merchantTokens[index + offset] === aliasToken,
    ),
  );
}

export function pickLongestMerchantMatch<
  T extends { normalizedAlias: string; priority: number },
>(merchantRaw: string, candidates: T[]) {
  return candidates
    .filter((candidate) =>
      merchantTokenSequenceMatch(merchantRaw, candidate.normalizedAlias),
    )
    .sort(
      (a, b) =>
        b.normalizedAlias.length - a.normalizedAlias.length ||
        b.priority - a.priority ||
        a.normalizedAlias.localeCompare(b.normalizedAlias),
    )[0];
}
