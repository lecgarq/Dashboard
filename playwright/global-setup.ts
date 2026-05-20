import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { encode } from "@auth/core/jwt";
import { Client } from "pg";

/**
 * Mints a real NextAuth v5 (Auth.js) JWT session cookie for the configured admin
 * user and writes it to playwright/.auth/storageState.json.
 *
 * Why this shape:
 *  - The app uses `session: { strategy: "jwt" }` (server/auth.ts), so there is no
 *    DB session row to create — the session lives entirely in the encrypted cookie.
 *  - Auth.js derives the encryption key from `secret` + `salt`, where `salt` is the
 *    cookie name. For http://localhost (no TLS) that name is `authjs.session-token`.
 *  - We import Auth.js's OWN `encode`, so the token is byte-compatible with what the
 *    running app will `decode` — we are not faking the crypto.
 *  - `sub` is the real admin user's DB id; the app's `jwt` callback re-reads role
 *    from the DB by `sub`, so this enters as a genuine authenticated admin session.
 *
 * Nothing here is enabled at production runtime — it only runs under the e2e suite.
 */

// Cookie name for NextAuth v5 over http (no `__Secure-` prefix without TLS).
const COOKIE_NAME = "authjs.session-token";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`[e2e global-setup] Missing required env var: ${name}`);
  }
  return v;
}

export default async function globalSetup(): Promise<void> {
  loadEnv(); // load .env so AUTH_SECRET / ADMIN_EMAIL / DATABASE_URL are present

  const secret = requireEnv("AUTH_SECRET");
  const adminEmail = requireEnv("ADMIN_EMAIL");
  const databaseUrl = requireEnv("DATABASE_URL");

  // Resolve the real admin user id from the DB (no hardcoding).
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let row: { id: string; email: string; role: string; name: string | null };
  try {
    const res = await client.query<{ id: string; email: string; role: string; name: string | null }>(
      'SELECT id, email, role, name FROM "User" WHERE lower(email) = lower($1) LIMIT 1',
      [adminEmail],
    );
    if (res.rows.length === 0) {
      throw new Error(`[e2e global-setup] No User row for ADMIN_EMAIL=${adminEmail}`);
    }
    row = res.rows[0];
  } finally {
    await client.end();
  }

  if (row.role !== "ADMIN") {
    throw new Error(
      `[e2e global-setup] User ${adminEmail} has role=${row.role}; admin-gated data requires ADMIN.`,
    );
  }

  // Claim shape mirrors server/auth.ts jwt() callback so the session callback maps it correctly.
  const token = await encode({
    salt: COOKIE_NAME,
    secret,
    maxAge: MAX_AGE_SECONDS,
    token: {
      sub: row.id,
      name: row.name ?? "",
      email: row.email,
      role: "ADMIN",
      isPrimaryAdmin: true,
      hasCredentials: true,
      providers: [],
      moduleAccess: [],
    },
  });

  const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? "3100"}`;
  const hostname = new URL(baseURL).hostname;
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;

  const storageState = {
    cookies: [
      {
        name: COOKIE_NAME,
        value: token,
        domain: hostname,
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
        expires,
      },
    ],
    origins: [] as Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>,
  };

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(path.join(authDir, "storageState.json"), JSON.stringify(storageState, null, 2));

  // eslint-disable-next-line no-console
  console.log(
    `[e2e global-setup] Minted admin session for ${row.email} (sub=${row.id}) → storageState.json`,
  );
}
