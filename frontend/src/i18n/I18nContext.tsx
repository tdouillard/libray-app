import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguage, setLanguage, t, type Language, type MessageKey } from "./index";

const STORAGE_KEY = "libray.language";

interface I18nValue {
  lang: Language;
  languages: typeof LANGUAGES;
  /* Applies a language at once and remembers it on this device. */
  setLang: (code: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

/* Without a provider (e.g. isolated component tests) everything is English. */
const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANGUAGE,
  languages: LANGUAGES,
  setLang: () => undefined,
  t,
});

function readStored(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/* Current interface language. The choice is remembered on this device; a signed-in user's saved language wins
   (see useLanguageSync). */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const initial = readStored();
    setLanguage(initial); // module-level language used by t() outside React (e.g. API error messages)
    document.documentElement.lang = initial;
    return initial;
  });

  const setLang = useCallback((code: Language) => {
    if (!isLanguage(code)) return;
    setLanguage(code);
    document.documentElement.lang = code;
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* not persisted, still applied */
    }
    setLangState(code);
  }, []);

  // A new `t` identity per language makes every consumer re-render when the language changes.
  const value = useMemo<I18nValue>(
    () => ({ lang, languages: LANGUAGES, setLang, t: (key, vars) => t(key, vars) }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
