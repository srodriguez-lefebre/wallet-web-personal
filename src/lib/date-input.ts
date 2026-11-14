export function localDateInput(value: Date | string = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateInputToIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined)
    throw new Error("Invalid calendar date");
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (localDateInput(date) !== value) throw new Error("Invalid calendar date");
  return date.toISOString();
}

/** HTML datetime-local values are wall-clock minutes, never UTC substrings. */
export function localDateTimeInput(value: Date | string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid local date and time");
  return `${localDateInput(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function dateTimeInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Invalid local date and time");
  const date = new Date(value);
  if (localDateTimeInput(date) !== value) throw new Error("Invalid local date and time");
  return date.toISOString();
}
