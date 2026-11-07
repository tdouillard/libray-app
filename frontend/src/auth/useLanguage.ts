import { useCallback, useEffect } from "react";
import { useI18n } from "../i18n/I18nContext";
import { isLanguage, type Language } from "../i18n";
import { useAuth } from "./AuthContext";

/* A signed-in user's saved language wins over the one remembered on this device. */
export function useLanguageSync() {
  const { user } = useAuth();
  const { setLang } = useI18n();
  const saved = user?.user_metadata?.language;

  useEffect(() => {
    if (isLanguage(saved)) setLang(saved);
  }, [saved, setLang]);
}

/* Language picked in the profile menu or the settings page: applied at once and saved to the account.
   Rejects with the save error (the language stays applied locally). */
export function useChangeLanguage() {
  const { user, saveLanguage } = useAuth();
  const { setLang } = useI18n();

  return useCallback(
    async (code: Language) => {
      setLang(code);
      if (user) await saveLanguage(code);
    },
    [user, saveLanguage, setLang]
  );
}
