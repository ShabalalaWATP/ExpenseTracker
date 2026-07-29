export const THEME_STORAGE_KEY = "expense-tracker-theme";

export type Theme = "system" | "light" | "dark";

export function resolveStoredTheme(value: string | null | undefined): Theme {
  return value === "system" || value === "light" || value === "dark"
    ? value
    : "dark";
}
