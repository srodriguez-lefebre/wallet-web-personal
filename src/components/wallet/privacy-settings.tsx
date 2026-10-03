import { useEffect, useState } from "react";
import {
  autoLockEvent,
  autoLockOptions,
  readAutoLockMinutes,
  saveAutoLockMinutes,
  validAutoLockMinutes,
} from "@/lib/privacy";
import { useAuth } from "@/providers/auth-provider";

export function PrivacySettings() {
  const [minutes, setMinutes] = useState(readAutoLockMinutes);
  const { expiresAt } = useAuth();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const preference = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      setMinutes(validAutoLockMinutes(value) ? value : readAutoLockMinutes());
    };
    const stored = (event: StorageEvent) => {
      if (event.key === "wallet-auto-lock-minutes" || event.key === null)
        setMinutes(readAutoLockMinutes());
    };
    window.addEventListener(autoLockEvent, preference);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener(autoLockEvent, preference);
      window.removeEventListener("storage", stored);
    };
  }, []);
  return (
    <div className="space-y-3 rounded-md border p-3">
      <label className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-medium">Lock after inactivity</span>
          <span className="text-sm text-muted-foreground">
            Preference for this browser. Locking clears the session and private
            cache.
          </span>
        </span>
        <select
          aria-label="Lock after inactivity"
          value={minutes}
          className="rounded-md border bg-background p-2"
          onChange={(event) => {
            const value = Number(event.target.value);
            if (validAutoLockMinutes(value)) {
              setMinutes(value);
              saveAutoLockMinutes(value);
            }
          }}
        >
          {autoLockOptions.map((value) => (
            <option key={value} value={value}>
              {value ? `${value} minutes` : "Off"}
            </option>
          ))}
        </select>
      </label>
      {expiresAt ? (
        <p className="text-sm text-muted-foreground">
          Session expires: {new Date(expiresAt).toLocaleString("es-UY")}
        </p>
      ) : null}
    </div>
  );
}
