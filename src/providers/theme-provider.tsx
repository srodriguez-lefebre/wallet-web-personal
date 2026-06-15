import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { readStorage, writeStorage } from "@/lib/storage";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const themeKey = "wallet-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = readStorage(themeKey);
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStorage(themeKey, theme);
  }, [theme]);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
  }

  function toggleTheme() {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
