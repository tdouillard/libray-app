import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "..", "..");
const repoRoot = path.join(backendRoot, "..");
const schemaFile = path.join(repoRoot, "supabase", "schema.sql");

/* Minimal .env reader (KEY=value) for the repo-root .env; process env wins. Same variable names as expense-split. */
function loadEnv(): Record<string, string | undefined> {
  const out: Record<string, string> = {};
  const file = path.join(repoRoot, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...out, ...process.env };
}

/* Applies supabase/schema.sql to the Supabase project's Postgres (libray-app's own project). */
async function main() {
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_DB_PASSWORD) {
    throw new Error("SUPABASE_URL and SUPABASE_DB_PASSWORD are required (repo-root .env)");
  }
  const ref = new URL(env.SUPABASE_URL).hostname.split(".")[0];
  // The host may carry its port ("host:6543").
  const [host, hostPort] = (env.SUPABASE_DB_HOST || env.SUPABASE_HOST || `db.${ref}.supabase.co`).split(":");
  const client = new pg.Client({
    host,
    port: Number(env.SUPABASE_DB_PORT) || Number(hostPort) || 5432,
    user: env.SUPABASE_DB_USER || env.SUPABASE_USER || "postgres",
    password: env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(readFileSync(schemaFile, "utf8"));
    console.log("Library schema ready");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
