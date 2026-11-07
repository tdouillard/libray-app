import { SupabaseClient } from "./supabase";
import { avatarPath, avatarProblem } from "./avatar";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const user = { id: "u1", email: "me@example.com" };
const tokens = { access_token: "at", refresh_token: "rt", expires_in: 3600, user };

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  const client = new SupabaseClient({ url: "https://x.supabase.co/", key: "anon", storage: memoryStorage(), fetchFn });
  return { client, calls };
}

describe("SupabaseClient", () => {
  it("signs in, persists the session and calls REST as the user", async () => {
    const { client, calls } = setup((url) => (url.includes("/auth/v1/token") ? json(tokens) : json([{ id: 1 }])));
    await client.signIn("me@example.com", "pw");
    expect(client.user?.id).toBe("u1");

    await client.rest("/books");
    const rest = calls.at(-1)!;
    expect(rest.url).toBe("https://x.supabase.co/rest/v1/books");
    expect((rest.init.headers as Record<string, string>).Authorization).toBe("Bearer at");
  });

  it("maps invalid credentials to a readable message", async () => {
    const { client } = setup(() => json({ error_code: "invalid_credentials" }, 400));
    await expect(client.signIn("a@b.c", "bad")).rejects.toThrow("Invalid email or password.");
  });

  it("updates the user with a redirect and keeps the new user in the session", async () => {
    const { client, calls } = setup((url, init) =>
      url.includes("/auth/v1/token") ? json(tokens) : json({ ...user, new_email: "new@example.com" })
    );
    await client.signIn("me@example.com", "pw");
    const updated = await client.updateUser({ email: "new@example.com", nonce: "123456" }, "https://app/");

    const call = calls.at(-1)!;
    expect(call.url).toBe("https://x.supabase.co/auth/v1/user?redirect_to=https%3A%2F%2Fapp%2F");
    expect(call.init.method).toBe("PUT");
    expect(JSON.parse(call.init.body as string)).toEqual({ email: "new@example.com", nonce: "123456" });
    expect(updated.new_email).toBe("new@example.com");
    expect(client.user?.new_email).toBe("new@example.com");
  });

  it("signs out other sessions only", async () => {
    const { client, calls } = setup((url) => (url.includes("/auth/v1/token") ? json(tokens) : new Response(null, { status: 204 })));
    await client.signIn("me@example.com", "pw");
    await client.signOutOthers();
    expect(calls.at(-1)!.url).toBe("https://x.supabase.co/auth/v1/logout?scope=others");
    expect(client.user).not.toBeNull();
  });

  it("uploads a blob untouched and builds a signed URL", async () => {
    const { client, calls } = setup((url) => {
      if (url.includes("/auth/v1/token")) return json(tokens);
      if (url.includes("/object/sign/")) return json({ signedURL: "/object/sign/avatars/u1/avatar.jpg?token=t" });
      return json({});
    });
    await client.signIn("me@example.com", "pw");
    const blob = new Blob(["x"], { type: "image/jpeg" });
    await client.uploadObject("avatars", "u1/avatar.jpg", blob);
    const upload = calls.at(-1)!;
    expect(upload.init.body).toBe(blob);
    expect((upload.init.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect((upload.init.headers as Record<string, string>)["x-upsert"]).toBe("true");

    expect(await client.signedUrl("avatars", "u1/avatar.jpg", 3600)).toBe(
      "https://x.supabase.co/storage/v1/object/sign/avatars/u1/avatar.jpg?token=t"
    );
  });

  it("consumes the session handed over in the URL hash", async () => {
    const { client } = setup(() => json(user));
    expect(await client.consumeHashSession("#foo=bar")).toBe(false);
    expect(await client.consumeHashSession("#access_token=at2&refresh_token=rt2&expires_in=100&type=signup")).toBe("session");
    expect(client.user?.id).toBe("u1");
  });

  it("recognises a password reset link", async () => {
    const { client } = setup(() => json(user));
    expect(await client.consumeHashSession("#access_token=at2&refresh_token=rt2&type=recovery")).toBe("recovery");
  });

  it("asks for a reset email with the redirect URL", async () => {
    const { client, calls } = setup(() => new Response(null, { status: 200 }));
    await client.resetPasswordForEmail("me@example.com", "https://app/");
    expect(calls[0].url).toBe("https://x.supabase.co/auth/v1/recover");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: "me@example.com", redirect_to: "https://app/" });
  });

  it("forgets the session without calling the server", async () => {
    const { client, calls } = setup(() => json(tokens));
    await client.signIn("me@example.com", "pw");
    const before = calls.length;
    client.forgetSession();
    expect(client.user).toBeNull();
    expect(calls.length).toBe(before);
  });
});

describe("avatar", () => {
  it("accepts only small JPEG, PNG or WebP files", () => {
    expect(avatarProblem({ type: "image/png", size: 1000 })).toBe("");
    expect(avatarProblem({ type: "image/gif", size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    expect(avatarProblem({ type: "image/jpeg", size: 3 * 1024 * 1024 })).toMatch(/2 MB/);
  });

  it("stores the photo at <user id>/avatar.jpg", () => {
    expect(avatarPath("u1")).toBe("u1/avatar.jpg");
  });
});
