import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { nextThemePreference, resolveThemePreference, type ThemePreference } from "@shared/theme";

type Theme = ThemePreference;

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Tema escolhido no botão (null = a pessoa nunca escolheu; segue o sistema). */
function readSavedTheme(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

function systemTheme(fallback: Theme): Theme {
  try {
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return fallback;
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    return resolveThemePreference(readSavedTheme(), systemTheme(defaultTheme));
  });

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Sem escolha salva, acompanha o modo claro/escuro do sistema também depois de abrir.
  useEffect(() => {
    if (!switchable || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => {
      if (!readSavedTheme()) setTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => {
          const next = nextThemePreference(prev);
          try {
            localStorage.setItem("theme", next);
          } catch {
            // O tema continua funcional mesmo quando o navegador bloqueia o armazenamento.
          }
          return next;
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
