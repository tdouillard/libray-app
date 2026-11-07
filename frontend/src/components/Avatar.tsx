import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

export const AVATAR_CHANGED = "libray:avatar-changed";

/* The signed-in user's photo, or their initials when there is none. Reloads when the photo changes. */
export function Avatar({ size = "md" }: { size?: "md" | "xl" }) {
  const { user, initials, avatarUrl } = useAuth();
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void avatarUrl().then((next) => {
        if (!cancelled) setUrl(next);
      });
    };
    load();
    window.addEventListener(AVATAR_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(AVATAR_CHANGED, load);
    };
  }, [user?.id, avatarUrl]);

  const box = size === "xl" ? "h-20 w-20 text-2xl" : "h-9 w-9 text-sm";
  return url ? (
    <img src={url} alt="" referrerPolicy="no-referrer" className={`${box} rounded-full object-cover`} />
  ) : (
    <span className={`${box} flex items-center justify-center rounded-full bg-slate-900 font-semibold text-white`}>
      {initials}
    </span>
  );
}
