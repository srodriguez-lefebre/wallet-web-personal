import type { CreditCard, CurrencyCode } from "@shared/types";

export interface CardDraft {
  name: string;
  issuer: string;
  lastFour: string;
  creditLimit: string;
  limitCurrency: CurrencyCode;
  closingDay: string;
  dueDay: string;
  color: string;
  note: string;
}

export function emptyDraft(): CardDraft {
  return {
    name: "",
    issuer: "",
    lastFour: "",
    creditLimit: "",
    limitCurrency: "UYU",
    closingDay: "20",
    dueDay: "5",
    color: "#2563EB",
    note: "",
  };
}

export function draftFromCard(card: CreditCard): CardDraft {
  return {
    name: card.name,
    issuer: card.issuer,
    lastFour: card.lastFour,
    creditLimit: String(card.creditLimit),
    limitCurrency: card.limitCurrency,
    closingDay: String(card.closingDay),
    dueDay: String(card.dueDay),
    color: card.color,
    note: card.note ?? "",
  };
}
