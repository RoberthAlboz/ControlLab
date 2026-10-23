export type ThemePreference = "light" | "dark";

export function resolveThemePreference(value: string | null, fallback: ThemePreference = "light"): ThemePreference {
  return value === "dark" || value === "light" ? value : fallback;
}

export function nextThemePreference(theme: ThemePreference): ThemePreference {
  return theme === "light" ? "dark" : "light";
}
