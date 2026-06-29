import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createSession } from "@/services/auth-service";

const tokenKey = "wallet-session-token";
const expiresAtKey = "wallet-session-expires-at";
const legacyTokenKey = "wallet-api-token";

function clearStoredSession() {
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(expiresAtKey);
  window.sessionStorage.removeItem(tokenKey);
}

function getTokenExpiration(token: string) {
  try {
    const [payload] = token.split(".");
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(paddedPayload)) as { exp?: number };
    return typeof parsed.exp === "number" ? new Date(parsed.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

function readStoredSession() {
  if (typeof window === "undefined") return null;

  const token = window.localStorage.getItem(tokenKey) ?? window.sessionStorage.getItem(tokenKey);
  const expiresAt = window.localStorage.getItem(expiresAtKey) ?? (token ? getTokenExpiration(token) : null);
  const expiresAtTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;

  if (!token || !expiresAt || !Number.isFinite(expiresAtTime) || expiresAtTime <= Date.now()) {
    clearStoredSession();
    return null;
  }

  window.localStorage.setItem(tokenKey, token);
  window.localStorage.setItem(expiresAtKey, expiresAt);
  window.sessionStorage.removeItem(tokenKey);
  return token;
}

interface AuthContextValue {
  isUnlocked: boolean;
  token: string | null;
  unlock: (token: string) => Promise<boolean>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState(readStoredSession);

  async function unlock(nextToken: string) {
    const cleanToken = nextToken.trim();
    if (cleanToken.length < 4) return false;

    const session = await createSession(cleanToken);
    if (!session) return false;
    window.localStorage.setItem(tokenKey, session.token);
    window.localStorage.setItem(expiresAtKey, session.expiresAt);
    window.sessionStorage.removeItem(tokenKey);
    setToken(session.token);
    return true;
  }

  function lock() {
    clearStoredSession();
    setToken(null);
  }

  useEffect(() => {
    window.localStorage.removeItem(legacyTokenKey);
    const handleUnauthorized = () => lock();
    window.addEventListener("wallet:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("wallet:unauthorized", handleUnauthorized);
  }, []);

  const value = useMemo(
    () => ({
      isUnlocked: Boolean(token),
      token,
      unlock,
      lock,
    }),
    [token],
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
