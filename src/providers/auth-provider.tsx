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

interface AuthContextValue {
  isUnlocked: boolean;
  token: string | null;
  unlock: (token: string) => Promise<boolean>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem(tokenKey),
  );

  async function unlock(nextToken: string) {
    const cleanToken = nextToken.trim();
    if (cleanToken.length < 4) return false;

    const session = await createSession(cleanToken);
    if (!session) return false;
    window.sessionStorage.setItem(tokenKey, session.token);
    setToken(session.token);
    return true;
  }

  function lock() {
    window.sessionStorage.removeItem(tokenKey);
    setToken(null);
  }

  useEffect(() => {
    window.localStorage.removeItem("wallet-api-token");
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
