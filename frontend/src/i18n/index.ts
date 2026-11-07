import en, { type MessageKey } from "./en";
import fr from "./fr";
import de from "./de";

export type { MessageKey };

export const LANGUAGES = [
  { code: "en", label: "English", locale: "en-GB" },
  { code: "fr", label: "Français", locale: "fr-FR" },
  { code: "de", label: "Deutsch", locale: "de-DE" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LANGUAGE: Language = "en";

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { en, fr, de };
let current: Language = DEFAULT_LANGUAGE;

export const isLanguage = (code: unknown): code is Language => LANGUAGES.some((l) => l.code === code);

export function setLanguage(code: unknown) {
  if (isLanguage(code)) current = code;
}

export const getLanguage = (): Language => current;
export const getLocale = (): string => LANGUAGES.find((l) => l.code === current)!.locale;

/* Translates a key in the current language, falling back to English. `{name}` placeholders are filled from `vars`. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const text = DICTIONARIES[current][key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
