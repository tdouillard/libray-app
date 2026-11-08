import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useChangeLanguage } from "../auth/useLanguage";
import { isLanguage } from "../i18n";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "../theme";
import { Avatar } from "./Avatar";

/* Avatar button with a dropdown: who is signed in, language, settings and sign out (same menu as expense-split). */
export function ProfileMenu() {
  const { user, displayName, signOut, isAdmin } = useAuth();
  const { lang, languages, t } = useI18n();
  const changeLanguage = useChangeLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onLanguage(code: string) {
    if (!isLanguage(code)) return;
    setError("");
    try {
      await changeLanguage(code);
    } catch (e) {
      setError(t("language.saveError", { message: e instanceof Error ? e.message : t("error.generic") }));
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("menu.profile")}
        onClick={() => setOpen((v) => !v)}
        className="flex rounded-full ring-offset-2 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <Avatar />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-72 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>

          <label className="mx-1 flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-700">
            <span>{t("language.label")}</span>
            <select
              name="language"
              value={lang}
              onChange={(e) => void onLanguage(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert" className="px-3 pb-2 text-xs text-red-600">{error}</p>}

          <div className="mx-1 flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-700">
            <span id="theme-label">{t("theme.dark")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-labelledby="theme-label"
              onClick={toggleTheme}
              className={`relative h-6 w-11 rounded-full transition-colors ${theme === "dark" ? "bg-indigo-600" : "bg-slate-300"}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${theme === "dark" ? "translate-x-5" : ""}`}
              />
            </button>
          </div>

          <Link
            role="menuitem"
            to="/account"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {t("menu.settings")}
          </Link>
          {isAdmin && (
            <Link
              role="menuitem"
              to="/admin/scan-logs"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {t("admin.menu")}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            {t("menu.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
