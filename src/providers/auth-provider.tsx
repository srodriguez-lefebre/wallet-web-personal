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

import { createWalletClient, type WalletClient } from "@/services/api-client";
import { readStorage, removeStorage, writeStorage } from "@/lib/storage";

const tokenKey = "wallet-session-token";
const expiresAtKey = "wallet-session-expires-at";
const legacyTokenKey = "wallet-api-token";

function clearStoredSession() {
  for (const key of [tokenKey, expiresAtKey, legacyTokenKey, "wallet-dataset-cache"])
    removeStorage(key);
  try {
    window.sessionStorage.removeItem(tokenKey);
  } catch {
    /* The session can still be cleared in memory. */
  }
}

function getTokenExpiration(token: string) {
  try {
    const [payload = ""] = token.split(".");
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    );
    const parsed = JSON.parse(window.atob(paddedPayload)) as { exp?: number };
    return typeof parsed.exp === "number" ? new Date(parsed.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

function effectiveExpiration(token: string, expiresAt: string | null) {
  const signed = getTokenExpiration(token);
  const provided = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const expiration = signed
    ? Math.min(Date.parse(signed), Number.isFinite(provided) ? provided : Infinity)
    : provided;
  return Number.isFinite(expiration) ? new Date(expiration).toISOString() : null;
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
  const expiresAt = token ? effectiveExpiration(token, readStorage(expiresAtKey)) : null;
  const expiresAtTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;

  if (!token || !expiresAt || !Number.isFinite(expiresAtTime) || expiresAtTime <= Date.now()) {
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
  client: WalletClient;
  isUnlocked: boolean;
  token: string | null;
  expiresAt: string | null;
  unlock: (token: string) => Promise<boolean>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState(readStoredSession);
  const sessionRef = useRef(session);
  const updateSession = useCallback((next: typeof session) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  const attempt = useRef(0);
  const lock = useCallback(() => {
    attempt.current += 1;
    clearStoredSession();
    updateSession(null);
  }, [updateSession]);
  const getToken = useCallback(() => sessionRef.current?.token ?? null, []);
  const onUnauthorized = useCallback(
    (failedToken: string) => {
      if (sessionRef.current?.token === failedToken) lock();
    },
    [lock],
  );
  // The factory stores these callbacks; it never reads the session during construction.
  // eslint-disable-next-line react-hooks/refs
  const [client] = useState(() => createWalletClient(getToken, { onUnauthorized }));

  const unlock = useCallback(
    async (nextToken: string) => {
      const revision = ++attempt.current;
      const cleanToken = nextToken.trim();
      if (cleanToken.length < 4) return false;

      const nextSession = await client["auth.unlock"]({ body: { token: cleanToken } }).catch(
        () => null,
      );
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
      updateSession({ ...nextSession, expiresAt });
      return true;
    },
    [client, updateSession],
  );

  useEffect(() => {
    removeStorage(legacyTokenKey);
    removeStorage("wallet-auto-lock-minutes");
    const handleStorage = (event: StorageEvent) => {
      if (event.key === tokenKey || event.key === expiresAtKey || event.key === null) {
        attempt.current += 1;
        updateSession(readStoredSession());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [updateSession]);

  useEffect(() => {
    if (!session) return;
    let timeout: number | undefined;
    const expiry = Date.parse(session.expiresAt);
    const check = () => {
      window.clearTimeout(timeout);
      const now = Date.now();
      if (now >= expiry) {
        lock();
        return;
      }
      timeout = window.setTimeout(check, Math.min(expiry - now, 24 * 60 * 60_000));
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [session, lock]);

  const value = useMemo(
    () => ({
      client,
      isUnlocked: Boolean(session),
      token: session?.token ?? null,
      expiresAt: session?.expiresAt ?? null,
      unlock,
      lock,
    }),
    [client, session, unlock, lock],
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
