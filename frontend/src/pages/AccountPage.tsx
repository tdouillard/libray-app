import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { useChangeLanguage } from "../auth/useLanguage";
import { Avatar, AVATAR_CHANGED } from "../components/Avatar";
import { useI18n } from "../i18n/I18nContext";
import { avatarProblem, toAvatarBlob } from "../services/avatar";

interface Status {
  ok: string;
  error: string;
  busy: boolean;
}
const idle = (): Status => ({ ok: "", error: "", busy: false });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50";
const primaryClass = "rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const RESET_COOLDOWN_MS = 60_000;

/* Runs an action while tracking busy / ok / error for one feedback area. */
function useAction() {
  const { t } = useI18n();
  const [state, setState] = useState<Status>(idle());
  async function run(action: () => Promise<void>, success: string): Promise<boolean> {
    setState({ ok: "", error: "", busy: true });
    try {
      await action();
      setState({ ok: success, error: "", busy: false });
      return true;
    } catch (e) {
      setState({ ok: "", error: e instanceof Error ? e.message : t("error.generic"), busy: false });
      return false;
    }
  }
  return { state, run, setState };
}

function Feedback({ state }: { state: Status }) {
  return (
    <>
      {state.ok && <p role="status" className="mt-2 text-sm text-emerald-700">{state.ok}</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
    </>
  );
}

function Setting({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-slate-100 py-5 first:border-t-0 md:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Panel({ title, hint, danger, children }: { title: string; hint?: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-3xl border bg-white p-6 shadow-sm ${danger ? "border-red-200" : "border-slate-200"}`}>
      <h3 className={`text-lg font-semibold ${danger ? "text-red-700" : "text-slate-900"}`}>{title}</h3>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ProfileSection() {
  const { user, saveProfile, uploadAvatar, removeAvatar, avatarUrl } = useAuth();
  const { t } = useI18n();
  const saved = user?.user_metadata?.username || "";
  const [username, setUsername] = useState(saved);
  const profile = useAction();
  const photo = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void avatarUrl().then((u) => {
      if (!cancelled) setHasPhoto(Boolean(u));
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  const dirty = username.trim() !== saved;

  async function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    const problem = avatarProblem(file);
    if (problem) {
      photo.setState({ ok: "", error: problem, busy: false });
      return;
    }
    photo.setState({ ok: "", error: "", busy: true });
    try {
      await uploadAvatar(await toAvatarBlob(file));
      setHasPhoto(true);
      window.dispatchEvent(new Event(AVATAR_CHANGED));
      photo.setState({ ok: t("account.photoSaved"), error: "", busy: false });
    } catch {
      photo.setState({ ok: "", error: t("account.photoFailed"), busy: false });
    }
  }

  async function onRemove() {
    if (await photo.run(removeAvatar, t("account.photoRemoved"))) {
      setHasPhoto(false);
      window.dispatchEvent(new Event(AVATAR_CHANGED));
    }
  }

  return (
    <Panel title={t("account.profileTitle")} hint={t("account.profileHint")}>
      <Setting title={t("account.photo")} hint={t("account.photoHint")}>
        <div className="flex items-center gap-4">
          <Avatar size="xl" />
          <div>
            <p className="text-xs text-slate-500">{t("account.photoSpec")}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass} disabled={photo.state.busy} onClick={() => fileInput.current?.click()}>
                {t("account.photoUpload")}
              </button>
              {hasPhoto && (
                <button type="button" className={buttonClass} disabled={photo.state.busy} onClick={onRemove}>
                  {t("account.photoRemove")}
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              data-testid="photo-input"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
        </div>
        <Feedback state={photo.state} />
      </Setting>

      <Setting title={t("account.username")} hint={t("account.usernameHint")}>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void profile.run(() => saveProfile(username), t("account.saved"));
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            maxLength={40}
            autoComplete="nickname"
            aria-label={t("account.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className={primaryClass} disabled={!dirty || profile.state.busy}>
            {t("common.save")}
          </button>
        </form>
        <Feedback state={profile.state} />
      </Setting>
    </Panel>
  );
}

/* Two-step change protected by a code emailed to the current address (re-authentication). */
function EmailSetting() {
  const { user, requestEmailCode, changeEmail } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const { state, run, setState } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codeSent) {
      const next = email.trim();
      if (!EMAIL.test(next)) return setState({ ok: "", error: t("account.emailInvalid"), busy: false });
      if (next.toLowerCase() === (user?.email || "").toLowerCase()) {
        return setState({ ok: "", error: t("account.emailSame"), busy: false });
      }
      if (await run(requestEmailCode, t("account.codeSent", { email: user?.email ?? "" }))) setCodeSent(true);
      return;
    }
    if (!code.trim()) return setState({ ok: "", error: t("account.codeEmpty"), busy: false });
    if (await run(() => changeEmail(email, code.trim()), t("account.emailSent"))) {
      setEmail("");
      setCode("");
      setCodeSent(false);
    }
  }

  return (
    <Setting title={t("account.email")} hint={t("account.currentEmail", { email: user?.email ?? "" })}>
      {user?.new_email && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          {t("account.pendingEmail", { email: user.new_email })}
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          {t("account.newEmail")}
          <input type="email" autoComplete="email" required readOnly={codeSent} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        {codeSent && (
          <label className="block text-sm font-medium text-slate-700">
            {t("account.code")}
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{t("account.codeHint", { email: user?.email ?? "" })}</span>
          </label>
        )}
        <Feedback state={state} />
        <div className="flex gap-2">
          <button type="submit" className={primaryClass} disabled={state.busy}>
            {codeSent ? t("account.changeEmail") : t("account.sendCode")}
          </button>
          {codeSent && (
            <button type="button" className={buttonClass} onClick={() => { setCodeSent(false); setCode(""); setState(idle()); }}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </Setting>
  );
}

/* Same as expense-split: an emailed link leads back to the app on a "new password" screen. */
function PasswordSetting() {
  const { user, sendResetLink } = useAuth();
  const { t } = useI18n();
  const { state, run, setState } = useAction();
  const resetAt = useRef(0);

  async function send() {
    if (Date.now() < resetAt.current) {
      return setState({ ok: "", error: t("account.resetWait"), busy: false });
    }
    if (await run(sendResetLink, t("account.resetSent"))) resetAt.current = Date.now() + RESET_COOLDOWN_MS;
  }

  return (
    <Setting title={t("account.password")} hint={t("account.passwordHint")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">{user?.email}</span>
        <button type="button" className={buttonClass} disabled={state.busy} onClick={() => void send()}>
          {t("account.sendReset")}
        </button>
      </div>
      <Feedback state={state} />
    </Setting>
  );
}

function SessionsSetting() {
  const { signOutOthers } = useAuth();
  const { t } = useI18n();
  const { state, run } = useAction();
  return (
    <Setting title={t("account.sessionsTitle")} hint={t("account.sessionsHint")}>
      <button type="button" className={buttonClass} disabled={state.busy} onClick={() => void run(signOutOthers, t("account.sessionsEnded"))}>
        {t("account.signOutOthers")}
      </button>
      <Feedback state={state} />
    </Setting>
  );
}

/* Same language chooser as the profile menu: applied at once and saved to the account. */
function PreferencesSection() {
  const { lang, languages, t } = useI18n();
  const changeLanguage = useChangeLanguage();
  const { state, setState } = useAction();

  async function pick(code: (typeof languages)[number]["code"]) {
    setState(idle());
    try {
      await changeLanguage(code);
    } catch (e) {
      setState({ ok: "", error: t("language.saveError", { message: e instanceof Error ? e.message : t("error.generic") }), busy: false });
    }
  }

  return (
    <Panel title={t("account.preferencesTitle")} hint={t("account.preferencesHint")}>
      <Setting title={t("account.language")} hint={t("account.languageHint")}>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1" role="group" aria-label={t("account.language")}>
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={lang === l.code}
              onClick={() => void pick(l.code)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${lang === l.code ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <Feedback state={state} />
      </Setting>
    </Panel>
  );
}

function DangerSection() {
  const { user, deleteAccount } = useAuth();
  const { t } = useI18n();
  const [typed, setTyped] = useState("");
  const { state, run } = useAction();
  const canDelete = typed.trim() !== "" && typed.trim().toLowerCase() === (user?.email || "").toLowerCase();

  return (
    <Panel title={t("account.dangerTitle")} danger>
      <Setting title={t("account.deleteTitle")} hint={t("account.deleteHint")}>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (canDelete) void run(deleteAccount, "");
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-medium text-slate-700">
            {t("account.deleteConfirmLabel", { email: user?.email ?? "" })}
            <input type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} />
          </label>
          <Feedback state={state} />
          <button type="submit" disabled={!canDelete || state.busy} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {t("account.deleteButton")}
          </button>
        </form>
      </Setting>
    </Panel>
  );
}

export function AccountPage() {
  const { displayName } = useAuth();
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar size="xl" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("account.title")}</h2>
            <p className="text-sm text-slate-500">{t("account.subtitle", { name: displayName })}</p>
          </div>
        </div>
      </section>

      <ProfileSection />

      <Panel title={t("account.securityTitle")} hint={t("account.securityHint")}>
        <EmailSetting />
        <PasswordSetting />
        <SessionsSetting />
      </Panel>

      <PreferencesSection />

      <DangerSection />
    </div>
  );
}
