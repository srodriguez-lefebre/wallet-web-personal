import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
  const [integerPart, ...fractionParts] = normalized.split(".");
  const integer = integerPart.replace(/\D/g, "");
  const safeMaxDecimals = Math.max(0, maxDecimals);

  if (!normalized.includes(".")) return integer;

  const fraction = fractionParts.join("").replace(/\D/g, "").slice(0, safeMaxDecimals);

  return `${integer}.${fraction}`;
}
