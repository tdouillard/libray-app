/* Minimal Supabase client (GoTrue email/password auth + PostgREST over fetch) with a persisted session.
   Same approach as the expense-split project (but against libray-app's own Supabase project). */

const SESSION_KEY = "libray.session";
const EXPIRY_SKEW_SECONDS = 60;

export interface SupabaseUser {
  id: string;
  email?: string;
  new_email?: string;
  user_metadata?: { username?: string } & Record<string, unknown>;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SupabaseUser;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const KNOWN_ERRORS: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  email_not_confirmed: "Please confirm your email address first.",
  weak_password: "Password too weak (6 characters minimum).",
  same_password: "The new password must differ from the current one.",
  reauthentication_needed: "Verification required: enter the code you received by email.",
  reauthentication_not_valid: "Invalid or expired verification code.",
  email_exists: "This email address is already in use.",
  email_address_invalid: "Enter a valid email address.",
  recent_login_required: "For your security, sign out and sign in again, then delete your account.",
  over_email_send_rate_limit: "Too many emails sent, try again later.",
};

function messageOf(data: any, status: number): string {
  for (const code of [data?.error_code, data?.code, data?.message]) {
    if (code && KNOWN_ERRORS[code]) return KNOWN_ERRORS[code];
  }
  if (/invalid login credentials/i.test(data?.msg || data?.message || "")) return KNOWN_ERRORS.invalid_credentials;
  return data?.msg || data?.message || data?.error_description || data?.error || `Error ${status}`;
}

export interface SupabaseOptions {
  url: string;
  key: string;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

export class SupabaseClient {
  private url: string;
  private key: string;
  private storage: SupabaseOptions["storage"];
  private fetchFn: typeof fetch;
  private now: () => number;
  private session: Session | null;

  constructor({ url, key, storage = globalThis.localStorage, fetchFn = (...a) => globalThis.fetch(...a), now = Date.now }: SupabaseOptions) {
    this.url = url.replace(/\/$/, "");
    this.key = key;
    this.storage = storage;
    this.fetchFn = fetchFn;
    this.now = now;
    this.session = this.readSession();
  }

  get user(): SupabaseUser | null {
    return this.session?.user ?? null;
  }

  private readSession(): Session | null {
    try {
      return JSON.parse(this.storage?.getItem(SESSION_KEY) ?? "null") || null;
    } catch {
      return null;
    }
  }

  private writeSession(session: Session | null) {
    this.session = session;
    if (!this.storage) return;
    if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
    else this.storage.removeItem(SESSION_KEY);
  }

  private async call(path: string, { method = "GET", body, token, headers = {} }: CallOptions = {}) {
    let res: Response;
    const raw = body instanceof Blob;
    try {
      res = await this.fetchFn(this.url + path, {
        method,
        headers: {
          apikey: this.key,
          "Content-Type": raw ? (body as Blob).type : "application/json",
          Authorization: "Bearer " + (token || this.key),
          ...headers,
        },
        body: body === undefined ? undefined : raw ? (body as Blob) : JSON.stringify(body),
      });
    } catch {
      throw new ApiError("Network error, check your connection.");
    }
    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
    if (!res.ok) throw new ApiError(messageOf(data, res.status), res.status);
    return data;
  }

  private storeTokens(data: any) {
    this.writeSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(this.now() / 1000) + (data.expires_in || 3600),
      user: data.user,
    });
  }

  async signIn(email: string, password: string): Promise<SupabaseUser | null> {
    this.storeTokens(await this.call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }));
    return this.user;
  }

  async signOut() {
    const token = this.session?.access_token;
    this.writeSession(null);
    if (token) await this.call("/auth/v1/logout", { method: "POST", token }).catch(() => {});
  }

  async resetPasswordForEmail(email: string, redirectTo?: string) {
    await this.call("/auth/v1/recover", { method: "POST", body: { email, redirect_to: redirectTo } });
  }

  private async refresh() {
    const refreshToken = this.session?.refresh_token;
    if (!refreshToken) throw new ApiError("Session expired, please sign in again.", 401);
    try {
      this.storeTokens(await this.call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } }));
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) this.writeSession(null);
      throw e;
    }
  }

  async accessToken(): Promise<string> {
    if (!this.session) throw new ApiError("Not signed in.", 401);
    if (this.session.expires_at - EXPIRY_SKEW_SECONDS <= this.now() / 1000) await this.refresh();
    return this.session!.access_token;
  }

  /* Drops the local session without calling the server (used once the account no longer exists). */
  forgetSession() {
    this.writeSession(null);
  }

  /* Ends every other session of the signed-in user; this browser stays signed in. */
  async signOutOthers() {
    await this.call("/auth/v1/logout?scope=others", { method: "POST", token: await this.accessToken() });
  }

  /* Session handed over in the URL hash after an email link. Returns the link type ("recovery" for a password
     reset link, "session" for any other) or false when the hash holds no session. */
  async consumeHashSession(hash: string): Promise<false | "recovery" | "session"> {
    const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const token = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!token || !refreshToken) return false;
    const user = await this.call("/auth/v1/user", { token });
    this.storeTokens({
      access_token: token,
      refresh_token: refreshToken,
      expires_in: Number(params.get("expires_in")) || 3600,
      user,
    });
    return params.get("type") === "recovery" ? "recovery" : "session";
  }

  /* Updates the signed-in user (email, password, user_metadata). An email change only applies once the
     confirmation link is opened; until then the returned user carries `new_email`. */
  async updateUser(attributes: Record<string, unknown>, redirectTo?: string): Promise<SupabaseUser> {
    const token = await this.accessToken();
    const query = redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : "";
    const user = await this.call("/auth/v1/user" + query, { method: "PUT", token, body: attributes });
    this.writeSession({ ...this.session!, user });
    return user;
  }

  /* Emails a one-time code (nonce) that confirms a sensitive change such as an email update. */
  async reauthenticate() {
    await this.call("/auth/v1/reauthenticate", { token: await this.accessToken() });
  }

  /* PostgREST call authenticated as the signed-in user; refreshes the token once on a 401. */
  rest<T = any>(path: string, options: Omit<CallOptions, "token"> = {}): Promise<T> {
    return this.authorized(`/rest/v1${path}`, options);
  }

  /* Private objects of the signed-in user: upload (replaces an existing file), short-lived link, removal. */
  async uploadObject(bucket: string, objectPath: string, blob: Blob) {
    await this.authorized(`/storage/v1/object/${bucket}/${objectPath}`, { method: "POST", body: blob, headers: { "x-upsert": "true" } });
  }

  async signedUrl(bucket: string, objectPath: string, expiresIn: number): Promise<string> {
    const { signedURL } = await this.authorized(`/storage/v1/object/sign/${bucket}/${objectPath}`, { method: "POST", body: { expiresIn } });
    return `${this.url}/storage/v1${signedURL}`;
  }

  async removeObject(bucket: string, objectPath: string) {
    await this.authorized(`/storage/v1/object/${bucket}`, { method: "DELETE", body: { prefixes: [objectPath] } });
  }

  private async authorized(path: string, options: Omit<CallOptions, "token">) {
    try {
      return await this.call(path, { ...options, token: await this.accessToken() });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401 || !this.session) throw e;
      await this.refresh();
      return this.call(path, { ...options, token: this.session!.access_token });
    }
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

/* Shared instance. Without configuration it points nowhere and every call fails with a network error. */
export const supabase = new SupabaseClient({ url: url || "http://localhost:0", key: key || "" });
