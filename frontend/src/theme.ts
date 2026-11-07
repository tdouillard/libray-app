import { useSyncExternalStore } from "react";

/* Light/dark theme, remembered on this device. The initial class is applied by the inline script in index.html
   (before first paint, to avoid a flash); without a saved choice the OS preference is used. */
export type Theme = "light" | "dark";

const KEY = "theme";
const listeners = new Set<() => void>();

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  const stored = readStored();
  if (stored) return stored;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the theme still applies for this session */
  }
  applyTheme(theme);
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
