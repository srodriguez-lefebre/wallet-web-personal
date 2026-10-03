import { readStorage, writeStorage } from "./storage";

export const autoLockOptions = [0, 5, 15, 30] as const;
export type AutoLockMinutes = (typeof autoLockOptions)[number];
export const autoLockEvent = "wallet:auto-lock-change";
export function validAutoLockMinutes(value: unknown): value is AutoLockMinutes {
  return autoLockOptions.some((option) => option === value);
}
export function readAutoLockMinutes(): AutoLockMinutes {
  const value = Number(readStorage("wallet-auto-lock-minutes"));
  return validAutoLockMinutes(value) ? value : 0;
}
export function saveAutoLockMinutes(value: AutoLockMinutes) {
  if (!validAutoLockMinutes(value)) return;
  writeStorage("wallet-auto-lock-minutes", String(value));
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(autoLockEvent, { detail: value }));
}
