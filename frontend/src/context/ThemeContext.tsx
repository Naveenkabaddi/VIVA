import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme, persist?: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "viva_theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme): "light" | "dark" {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, token, updateUser } = useAuth();
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored ?? "system";
  });
  const [resolved, setResolved] = useState<"light" | "dark">(() => applyTheme(theme));

  // Adopt the saved account preference on first authenticated load.
  useEffect(() => {
    if (!token || !user) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setThemeState(user.theme);
    }
  }, [token, user]);

  useEffect(() => {
    setResolved(applyTheme(theme));
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") setResolved(applyTheme("system"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme, persist = true) => {
      setThemeState(next);
      localStorage.setItem(STORAGE_KEY, next);
      if (persist && token) {
        updateUser({ theme: next });
        void apiPatchTheme(next);
      }
    },
    [token, updateUser],
  );

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

async function apiPatchTheme(theme: Theme) {
  try {
    await api.patch("/auth/me", { theme });
  } catch {
    // Theme is a local preference too; a failed sync must not break the UI.
  }
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
