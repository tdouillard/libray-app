import path from "path";
import { loadEnv } from "vite";

/* Browser-safe Supabase values only (project URL + publishable key), read from the repo-root .env
   (same variable names as expense-split's .env) or from the process environment (CI).
   Never expose the whole env: SUPABASE_DB_PASSWORD lives in the same file. */
export function supabaseDefine(mode: string) {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const key =
    env.VITE_SUPABASE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.STRIPE_PUBLISHABLE_KEY ||
    "";
  return {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
    "import.meta.env.VITE_SUPABASE_KEY": JSON.stringify(key),
  };
}
