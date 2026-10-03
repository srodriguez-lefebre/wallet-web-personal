import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { createSession } from "@/services/auth-service";
import { readStorage, removeStorage, writeStorage } from "@/lib/storage";
import {
  autoLockEvent,
  readAutoLockMinutes,
  validAutoLockMinutes,
} from "@/lib/privacy";

const tokenKey = "wallet-session-token";
const expiresAtKey = "wallet-session-expires-at";
const legacyTokenKey = "wallet-api-token";

function clearStoredSession() {
  for (const key of [
    tokenKey,
    expiresAtKey,
    legacyTokenKey,
    "wallet-dataset-cache",
  ])
    removeStorage(key);
  try {
    window.sessionStorage.removeItem(tokenKey);
  } catch {
    /* The session can still be cleared in memory. */
  }
}

function getTokenExpiration(token: string) {
  try {
    const [payload] = token.split(".");
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    );
    const parsed = JSON.parse(window.atob(paddedPayload)) as { exp?: number };
    return typeof parsed.exp === "number"
      ? new Date(parsed.exp * 1000).toISOString()
      : null;
  } catch {
    return null;
  }
}

function effectiveExpiration(token: string, expiresAt: string | null) {
  const signed = getTokenExpiration(token);
  const provided = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const expiration = signed
    ? Math.min(
        Date.parse(signed),
        Number.isFinite(provided) ? provided : Infinity,
      )
    : provided;
  return Number.isFinite(expiration)
    ? new Date(expiration).toISOString()
    : null;
}

function readStoredSession() {
  if (typeof window === "undefined") return null;

  let legacySession: string | null = null;
  try {
    legacySession = window.sessionStorage.getItem(tokenKey);
  } catch {
    /* Storage is optional. */
  }
  const token = readStorage(tokenKey) ?? legacySession;
  const expiresAt = token
    ? effectiveExpiration(token, readStorage(expiresAtKey))
    : null;
  const expiresAtTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;

  if (
    !token ||
    !expiresAt ||
    !Number.isFinite(expiresAtTime) ||
    expiresAtTime <= Date.now()
  ) {
    clearStoredSession();
    return null;
  }

  writeStorage(tokenKey, token);
  writeStorage(expiresAtKey, expiresAt);
  try {
    window.sessionStorage.removeItem(tokenKey);
  } catch {
    /* Storage is optional. */
  }
  return { token, expiresAt };
}

interface AuthContextValue {
  isUnlocked: boolean;
  token: string | null;
  expiresAt: string | null;
  unlock: (token: string) => Promise<boolean>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState(readStoredSession);
  const [autoLockMinutes, setAutoLockMinutes] = useState(readAutoLockMinutes);
  const attempt = useRef(0);
  const lock = useCallback(() => {
    attempt.current += 1;
    clearStoredSession();
    setSession(null);
  }, []);

  const unlock = useCallback(async (nextToken: string) => {
    const revision = ++attempt.current;
    const cleanToken = nextToken.trim();
    if (cleanToken.length < 4) return false;

    const nextSession = await createSession(cleanToken);
    const expiresAt = nextSession
      ? effectiveExpiration(nextSession.token, nextSession.expiresAt)
      : null;
    if (
      !nextSession ||
      revision !== attempt.current ||
      !expiresAt ||
      Date.parse(expiresAt) <= Date.now()
    )
      return false;
    writeStorage(tokenKey, nextSession.token);
    writeStorage(expiresAtKey, expiresAt);
    try {
      window.sessionStorage.removeItem(tokenKey);
    } catch {
      /* Keep a valid in-memory session. */
    }
    setSession({ ...nextSession, expiresAt });
    return true;
  }, []);

  useEffect(() => {
    removeStorage(legacyTokenKey);
    const handleUnauthorized = () => lock();
    const handlePreference = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      setAutoLockMinutes(
        validAutoLockMinutes(value) ? value : readAutoLockMinutes(),
      );
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === tokenKey ||
        event.key === expiresAtKey ||
        event.key === null
      )
        setSession(readStoredSession());
      if (event.key === "wallet-auto-lock-minutes" || event.key === null)
        setAutoLockMinutes(readAutoLockMinutes());
    };
    window.addEventListener("wallet:unauthorized", handleUnauthorized);
    window.addEventListener(autoLockEvent, handlePreference);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("wallet:unauthorized", handleUnauthorized);
      window.removeEventListener(autoLockEvent, handlePreference);
      window.removeEventListener("storage", handleStorage);
    };
  }, [lock]);

  useEffect(() => {
    if (!session) return;
    let timeout: number | undefined;
    let lastActivity = Date.now();
    const expiry = Date.parse(session.expiresAt);
    const check = () => {
      window.clearTimeout(timeout);
      const now = Date.now(),
        idleAt = autoLockMinutes
          ? lastActivity + autoLockMinutes * 60_000
          : Infinity;
      if (now >= expiry || now >= idleAt) {
        lock();
        return;
      }
      timeout = window.setTimeout(
        check,
        Math.min(expiry - now, idleAt - now, 24 * 60 * 60_000),
      );
    };
    const activity = () => {
      const now = Date.now();
      if (
        now >= expiry ||
        (autoLockMinutes && now - lastActivity >= autoLockMinutes * 60_000)
      ) {
        lock();
        return;
      }
      lastActivity = now;
      check();
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    check();
    events.forEach((event) =>
      window.addEventListener(event, activity, { passive: true }),
    );
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timeout);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [session, autoLockMinutes, lock]);

  const value = useMemo(
    () => ({
      isUnlocked: Boolean(session),
      token: session?.token ?? null,
      expiresAt: session?.expiresAt ?? null,
      unlock,
      lock,
    }),
    [session, unlock, lock],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
