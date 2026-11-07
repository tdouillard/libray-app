import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, type SupabaseUser } from "../services/supabase";
import { avatarPath } from "../services/avatar";

interface AuthValue {
  user: SupabaseUser | null;
  ready: boolean;
  displayName: string;
  initials: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /* Each of these throws an Error with a readable message on failure. */
  saveProfile: (username: string) => Promise<void>;
  requestEmailCode: () => Promise<void>;
  changeEmail: (email: string, code: string) => Promise<void>;
  changePassword: (password: string, code: string) => Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Session handed over by an email confirmation link (e.g. after an email change).
        if (await supabase.consumeHashSession(location.hash)) {
          history.replaceState(null, "", location.pathname + location.search);
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
    setUser(null);
  }, []);

  const saveProfile = useCallback(async (username: string) => {
    setUser(await supabase.updateUser({ data: { username: username.trim() } }));
  }, []);

  const requestEmailCode = useCallback(() => supabase.reauthenticate(), []);

  const changeEmail = useCallback(async (email: string, code: string) => {
    setUser(await supabase.updateUser({ email: email.trim(), nonce: code }, appUrl()));
  }, []);

  const changePassword = useCallback(async (password: string, code: string) => {
    setUser(await supabase.updateUser({ password, nonce: code }));
  }, []);

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
      user, ready, displayName, initials,
      signIn, signOut, saveProfile, requestEmailCode, changeEmail, changePassword,
      signOutOthers, uploadAvatar, removeAvatar, avatarUrl, deleteAccount,
    };
  }, [user, ready, signIn, signOut, saveProfile, requestEmailCode, changeEmail, changePassword,
      signOutOthers, uploadAvatar, removeAvatar, avatarUrl, deleteAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
