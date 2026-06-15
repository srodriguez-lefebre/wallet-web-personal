import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { readStorage, removeStorage, writeStorage } from "@/lib/storage";
import { validateToken } from "@/services/auth-service";

const tokenKey = "wallet-api-token";

interface AuthContextValue {
  isUnlocked: boolean;
  token: string | null;
  unlock: (token: string) => Promise<boolean>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState(() => readStorage(tokenKey));

  async function unlock(nextToken: string) {
    const cleanToken = nextToken.trim();
    if (cleanToken.length < 4) return false;

    const isValid = await validateToken(cleanToken);
    if (!isValid) return false;

    writeStorage(tokenKey, cleanToken);
    setToken(cleanToken);
    return true;
  }

  function lock() {
    removeStorage(tokenKey);
    setToken(null);
  }

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
