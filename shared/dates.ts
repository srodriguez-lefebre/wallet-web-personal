import {
  format,
  parseISO,
  endOfMonth,
  addMonths,
  differenceInCalendarDays,
  addDays,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
} from "date-fns";

import type { DateRange, WalletRecord } from "./types.js";

export function monthKey(date: string | Date) {
  return format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM");
}

export function dateKey(date: string | Date) {
  return format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM-dd");
}

export function dateRangeForMonth(month: string): DateRange {
  const date = parseISO(`${month}-15T12:00:00.000Z`);

  return {
    from: format(date, "yyyy-MM-01"),
    to: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export function availableMonthKeys(records: WalletRecord[]) {
  return [...new Set(records.map((record) => monthKey(record.occurredAt)))].sort((a, b) =>
    b.localeCompare(a),
  );
}

export function recentMonthKeys(records: WalletRecord[], fallbackMonth: string, limit = 6) {
  const months = availableMonthKeys(records);
  return (months.length > 0 ? months : [fallbackMonth]).slice(0, limit);
}

export function relativeMonthKeys(month: string, count = 3) {
  const start = parseISO(`${month}-15T12:00:00.000Z`);

  return Array.from({ length: count }, (_, index) =>
    format(addMonths(start, index - count + 1), "yyyy-MM"),
  );
}

export function relativeDateRanges(range: DateRange, count = 3): DateRange[] {
  const from = parseISO(`${range.from}T12:00:00.000Z`);
  const to = parseISO(`${range.to}T12:00:00.000Z`);
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);

  return Array.from({ length: count }, (_, index) => {
    const offset = (index - count + 1) * days;

    return {
      from: format(addDays(from, offset), "yyyy-MM-dd"),
      to: format(addDays(to, offset), "yyyy-MM-dd"),
    };
  });
}

export function recordsForMonth(records: WalletRecord[], month: string) {
  return records.filter((record) => monthKey(record.occurredAt) === month);
}

export function recordsForDateRange(records: WalletRecord[], range: DateRange) {
  const from = startOfDay(parseISO(`${range.from}T12:00:00.000Z`));
  const to = endOfDay(parseISO(`${range.to}T12:00:00.000Z`));

  return records.filter((record) => {
    const date = parseISO(record.occurredAt);
    return !isBefore(date, from) && !isAfter(date, to);
  });
}

export function dateKeysForRange(range: DateRange) {
  const from = parseISO(`${range.from}T12:00:00.000Z`);
  const to = parseISO(`${range.to}T12:00:00.000Z`);
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);

  return Array.from({ length: days }, (_, index) => format(addDays(from, index), "yyyy-MM-dd"));
}

export function isRecordInRange(record: WalletRecord, from?: string, to?: string) {
  const date = parseISO(record.occurredAt);
  const afterFrom = from ? !isBefore(date, parseISO(from)) : true;
  const beforeTo = to ? !isAfter(date, parseISO(to)) : true;
  return afterFrom && beforeTo;
}

export function groupRecordsByDay(records: WalletRecord[]) {
  return records.reduce<Record<string, WalletRecord[]>>((groups, record) => {
    const key = format(parseISO(record.occurredAt), "yyyy-MM-dd");
    groups[key] = groups[key] ?? [];
    groups[key].push(record);
    return groups;
  }, {});
}
