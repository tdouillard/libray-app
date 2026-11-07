import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

/* Shown after the user opens the link of a password reset email (they are signed in with a recovery session). */
export function ResetPasswordPage() {
  const { completeRecovery, skipRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password too short (6 characters minimum).");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await completeRecovery(password); // leaves this screen once the password is saved
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Personal library</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">New password</h1>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Change password"}
        </button>
        <button type="button" onClick={skipRecovery} className="w-full text-sm text-slate-500 hover:text-slate-700">
          Skip for now
        </button>
      </form>
    </div>
  );
}
