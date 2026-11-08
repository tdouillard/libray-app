import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, type SupabaseUser } from "../services/supabase";
import { avatarPath } from "../services/avatar";
import { fetchIsAdmin } from "../services/scanLogs";

interface AuthValue {
  user: SupabaseUser | null;
  ready: boolean;
  /* Listed in public.admins: unlocks the scan diagnostics. Only a convenience, the database enforces access. */
  isAdmin: boolean;
  /* True while the user arrived from a password reset email and still has to choose a new password. */
  recovering: boolean;
  displayName: string;
  initials: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /* Each of these throws an Error with a readable message on failure. */
  saveProfile: (username: string) => Promise<void>;
  /* Remembers the interface language on the account (so every device uses it). */
  saveLanguage: (language: string) => Promise<void>;
  requestEmailCode: () => Promise<void>;
  changeEmail: (email: string, code: string) => Promise<void>;
  /* Emails a link (valid for the signed-in address) that leads to the "new password" screen. */
  sendResetLink: () => Promise<void>;
  /* Sets the new password after a reset link and leaves the recovery screen. */
  completeRecovery: (password: string) => Promise<void>;
  skipRecovery: () => void;
  signOutOthers: () => Promise<void>;
  uploadAvatar: (blob: Blob) => Promise<void>;
  removeAvatar: () => Promise<void>;
  /* Short-lived link to the photo, or "" when there is none. */
  avatarUrl: () => Promise<string>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const appUrl = () => location.origin + import.meta.env.BASE_URL;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    let cancelled = false;
    setIsAdmin(false);
    if (userId) void fetchIsAdmin().then((admin) => !cancelled && setIsAdmin(admin));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Session handed over by an email confirmation link (e.g. after an email change).
        const kind = await supabase.consumeHashSession(location.hash);
        if (kind) {
          history.replaceState(null, "", location.pathname + location.search);
          if (kind === "recovery" && !cancelled) setRecovering(true);
        }
      } catch {
        /* an invalid link just leaves the login form */
      }
      if (supabase.user) {
        try {
          await supabase.accessToken(); // refreshes an expired token
        } catch {
          /* expired session: fall back to the login form */
        }
      }
      if (!cancelled) {
        setUser(supabase.user);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await supabase.signIn(email.trim(), password);
    setUser(supabase.user);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.signOut();
    setRecovering(false);
    setUser(null);
  }, []);

  const saveProfile = useCallback(async (username: string) => {
    setUser(await supabase.updateUser({ data: { username: username.trim() } }));
  }, []);

  const saveLanguage = useCallback(async (language: string) => {
    const username = supabase.user?.user_metadata?.username ?? "";
    setUser(await supabase.updateUser({ data: { username, language } }));
  }, []);

  const requestEmailCode = useCallback(() => supabase.reauthenticate(), []);

  const changeEmail = useCallback(async (email: string, code: string) => {
    setUser(await supabase.updateUser({ email: email.trim(), nonce: code }, appUrl()));
  }, []);

  const sendResetLink = useCallback(async () => {
    await supabase.resetPasswordForEmail(supabase.user!.email!, appUrl());
  }, []);

  const completeRecovery = useCallback(async (password: string) => {
    setUser(await supabase.updateUser({ password }));
    setRecovering(false);
  }, []);

  const skipRecovery = useCallback(() => setRecovering(false), []);

  const signOutOthers = useCallback(() => supabase.signOutOthers(), []);

  const uploadAvatar = useCallback(async (blob: Blob) => {
    await supabase.uploadObject("avatars", avatarPath(supabase.user!.id), blob);
  }, []);

  const removeAvatar = useCallback(async () => {
    await supabase.removeObject("avatars", avatarPath(supabase.user!.id));
  }, []);

  const avatarUrl = useCallback(async () => {
    if (!supabase.user) return "";
    try {
      return await supabase.signedUrl("avatars", avatarPath(supabase.user.id), 3600);
    } catch {
      return "";
    }
  }, []);

  /* Removes the photo, then the account itself (server-side checks in delete_my_account). */
  const deleteAccount = useCallback(async () => {
    await supabase.removeObject("avatars", avatarPath(supabase.user!.id)).catch(() => {});
    await supabase.rest("/rpc/delete_my_account", { method: "POST", body: {} });
    supabase.forgetSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const displayName = user?.user_metadata?.username || (user?.email || "").split("@")[0];
    const parts = displayName.split(/[._\-+\s]+/).filter(Boolean);
    const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : displayName.slice(0, 2) || "?").toUpperCase();
    return {
      user, ready, isAdmin, recovering, displayName, initials,
      signIn, signOut, saveProfile, saveLanguage, requestEmailCode, changeEmail, sendResetLink, completeRecovery, skipRecovery,
      signOutOthers, uploadAvatar, removeAvatar, avatarUrl, deleteAccount,
    };
  }, [user, ready, isAdmin, recovering, signIn, signOut, saveProfile, saveLanguage, requestEmailCode, changeEmail, sendResetLink, completeRecovery, skipRecovery,
      signOutOthers, uploadAvatar, removeAvatar, avatarUrl, deleteAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
