import { normalizeMerchantTerm } from "./normalization.js";
/** Indexed SQL candidate lookup, including complete contiguous token sequences only. */
export function matchingMerchantTerms(merchantRaw: string) {
  const tokens = normalizeMerchantTerm(merchantRaw).split(" ").filter(Boolean);
  const terms = new Set<string>();
  for (let start = 0; start < tokens.length; start++)
    for (let end = start + 1; end <= tokens.length; end++)
      terms.add(tokens.slice(start, end).join(" "));
  return [...terms];
}
