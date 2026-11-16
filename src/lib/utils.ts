import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { roundMoney } from "@shared/money";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const calendarDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCalendarDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : calendarDateFormat.format(date);
}

export function limitDecimalPlaces(value: string, maxDecimals = 2) {
  const normalized = value.replace(",", ".");
  const [integerPart = "0", ...fractionParts] = normalized.split(".");
  const integer = integerPart.replace(/\D/g, "");
  const safeMaxDecimals = Math.max(0, maxDecimals);

  if (!normalized.includes(".")) return integer;

  const fraction = fractionParts.join("").replace(/\D/g, "");
  if (fraction.length <= safeMaxDecimals) return `${integer}.${fraction}`;

  const amount = Number(`${integer}.${fraction}`);
  if (!Number.isFinite(amount)) return `${integer}.${fraction.slice(0, safeMaxDecimals)}`;
  if (safeMaxDecimals === 2) return String(roundMoney(amount));
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits: safeMaxDecimals,
  }).format(amount);
}
