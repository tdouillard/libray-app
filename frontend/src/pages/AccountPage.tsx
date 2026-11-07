import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { Avatar, AVATAR_CHANGED } from "../components/Avatar";
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

/* Runs an action while tracking busy / ok / error for one feedback area. */
function useAction() {
  const [state, setState] = useState<Status>(idle());
  async function run(action: () => Promise<void>, success: string): Promise<boolean> {
    setState({ ok: "", error: "", busy: true });
    try {
      await action();
      setState({ ok: success, error: "", busy: false });
      return true;
    } catch (e) {
      setState({ ok: "", error: e instanceof Error ? e.message : "Something went wrong.", busy: false });
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
      photo.setState({ ok: "Photo updated.", error: "", busy: false });
    } catch {
      photo.setState({ ok: "", error: "Could not process this picture. Try another one.", busy: false });
    }
  }

  async function onRemove() {
    if (await photo.run(removeAvatar, "Photo removed.")) {
      setHasPhoto(false);
      window.dispatchEvent(new Event(AVATAR_CHANGED));
    }
  }

  return (
    <Panel title="Profile" hint="How you appear in this app.">
      <Setting title="Photo" hint="Only you can see your photo. Your initials are shown when no photo is set.">
        <div className="flex items-center gap-4">
          <Avatar size="xl" />
          <div>
            <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 2 MB. Stored as a 512 px square with location data removed.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass} disabled={photo.state.busy} onClick={() => fileInput.current?.click()}>
                Upload photo
              </button>
              {hasPhoto && (
                <button type="button" className={buttonClass} disabled={photo.state.busy} onClick={onRemove}>
                  Remove
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

      <Setting title="Username" hint="Shown in your account and menu. Up to 40 characters.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void profile.run(() => saveProfile(username), "Profile saved.");
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            maxLength={40}
            autoComplete="nickname"
            aria-label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className={primaryClass} disabled={!dirty || profile.state.busy}>
            Save
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
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const { state, run, setState } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codeSent) {
      const next = email.trim();
      if (!EMAIL.test(next)) return setState({ ok: "", error: "Enter a valid email address.", busy: false });
      if (next.toLowerCase() === (user?.email || "").toLowerCase()) {
        return setState({ ok: "", error: "Enter an address different from your current one.", busy: false });
      }
      if (await run(requestEmailCode, `A code was sent to ${user?.email}. Enter it with the new address.`)) setCodeSent(true);
      return;
    }
    if (!code.trim()) return setState({ ok: "", error: "Enter the code you received by email.", busy: false });
    if (
      await run(
        () => changeEmail(email, code.trim()),
        "A confirmation email has been sent. Open the link to confirm the change."
      )
    ) {
      setEmail("");
      setCode("");
      setCodeSent(false);
    }
  }

  return (
    <Setting title="Email address" hint={`Currently ${user?.email}`}>
      {user?.new_email && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">Awaiting confirmation: {user.new_email}</p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          New address
          <input type="email" autoComplete="email" required readOnly={codeSent} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        {codeSent && (
          <label className="block text-sm font-medium text-slate-700">
            Verification code
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Enter the code we emailed to {user?.email}.</span>
          </label>
        )}
        <Feedback state={state} />
        <div className="flex gap-2">
          <button type="submit" className={primaryClass} disabled={state.busy}>
            {codeSent ? "Change email" : "Send code"}
          </button>
          {codeSent && (
            <button type="button" className={buttonClass} onClick={() => { setCodeSent(false); setCode(""); setState(idle()); }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </Setting>
  );
}

function PasswordSetting() {
  const { user, requestEmailCode, changePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const { state, run, setState } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codeSent) {
      if (password.length < 6) return setState({ ok: "", error: "Password too weak (6 characters minimum).", busy: false });
      if (password !== confirm) return setState({ ok: "", error: "The two passwords do not match.", busy: false });
      if (await run(requestEmailCode, `A code was sent to ${user?.email}. Enter it to confirm.`)) setCodeSent(true);
      return;
    }
    if (!code.trim()) return setState({ ok: "", error: "Enter the code you received by email.", busy: false });
    if (await run(() => changePassword(password, code.trim()), "Password changed.")) {
      setPassword("");
      setConfirm("");
      setCode("");
      setCodeSent(false);
    }
  }

  return (
    <Setting title="Password" hint="Changing it requires a code sent to your email address.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          New password
          <input type="password" autoComplete="new-password" required readOnly={codeSent} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirm new password
          <input type="password" autoComplete="new-password" required readOnly={codeSent} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </label>
        {codeSent && (
          <label className="block text-sm font-medium text-slate-700">
            Verification code
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
          </label>
        )}
        <Feedback state={state} />
        <div className="flex gap-2">
          <button type="submit" className={primaryClass} disabled={state.busy}>
            {codeSent ? "Change password" : "Send code"}
          </button>
          {codeSent && (
            <button type="button" className={buttonClass} onClick={() => { setCodeSent(false); setCode(""); setState(idle()); }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </Setting>
  );
}

function SessionsSetting() {
  const { signOutOthers } = useAuth();
  const { state, run } = useAction();
  return (
    <Setting title="Other devices" hint="Sign out every other browser or device. This one stays signed in.">
      <button type="button" className={buttonClass} disabled={state.busy} onClick={() => void run(signOutOthers, "Other devices have been signed out.")}>
        Sign out other devices
      </button>
      <Feedback state={state} />
    </Setting>
  );
}

function DangerSection() {
  const { user, deleteAccount } = useAuth();
  const [typed, setTyped] = useState("");
  const { state, run } = useAction();
  const canDelete = typed.trim() !== "" && typed.trim().toLowerCase() === (user?.email || "").toLowerCase();

  return (
    <Panel title="Danger zone" danger>
      <Setting
        title="Delete account"
        hint="Signs you out and permanently deletes your account, your books, your collections and your photo. You must have signed in within the last 10 minutes."
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (canDelete) void run(deleteAccount, "");
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-medium text-slate-700">
            Type {user?.email} to confirm
            <input type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} />
          </label>
          <Feedback state={state} />
          <button type="submit" disabled={!canDelete || state.busy} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            Delete my account
          </button>
        </form>
      </Setting>
    </Panel>
  );
}

export function AccountPage() {
  const { displayName } = useAuth();
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar size="xl" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h2>
            <p className="text-sm text-slate-500">{displayName} · your profile and sign-in.</p>
          </div>
        </div>
      </section>

      <ProfileSection />

      <Panel title="Sign-in & security" hint="Changes to your email are confirmed by a link sent to the new address.">
        <EmailSetting />
        <PasswordSetting />
        <SessionsSetting />
      </Panel>

      <DangerSection />
    </div>
  );
}
