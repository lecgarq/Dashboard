#!/usr/bin/env node
/**
 * One-time Autodesk (APS) 3-legged sign-in that:
 *   1. Reuses the dashboard's already-registered callback (APS_CALLBACK_URL,
 *      normally http://localhost:3000/api/auth/callback/autodesk), so NO new
 *      redirect URI has to be registered in aps.autodesk.com/myapps.
 *   2. Requests the dashboard's normal scopes PLUS data:write.
 *   3. Persists the resulting token back into the dashboard's DB (repairs the
 *      single-use refresh token + upgrades it to data:write).
 *   4. Writes the fresh access token to scratch/aps-access-token.json for an
 *      immediate follow-up write (so nothing needs to refresh and race).
 *
 * The dashboard MUST be stopped first so this can bind port 3000 for the
 * redirect. PKCE (S256) is used for maximum compatibility.
 *
 * Run:  node --env-file=.env scripts/aps-login.cjs
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BASE = "https://developer.api.autodesk.com";
const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const USER_EMAIL = process.env.APS_USER_EMAIL || "luis.cortes@hermosillo.com";
const REDIRECT_URI = process.env.APS_CLI_CALLBACK_URL || "http://localhost:6263/api/auth/callback/autodesk";

// Dashboard's normal scopes (see server/auth.ts) + data:write for the reopen.
const SCOPE = "openid data:read data:write data:create viewables:read user:read account:read";

const OUT_DIR = path.join(process.cwd(), "scratch");
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function openBrowser(url) {
  const [bin, args] = process.platform === "win32"
    ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  try {
    const child = spawn(bin, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch { /* URL is printed for manual paste */ }
}

async function getCode() {
  const u = new URL(REDIRECT_URI);
  const port = Number(u.port || "80");
  const state = crypto.randomBytes(16).toString("hex");
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

  const authUrl = `${BASE}/authentication/v2/authorize?` + new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
  });

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, `http://localhost:${port}`);
      if (reqUrl.pathname !== u.pathname) { res.writeHead(404); res.end(); return; }
      const error = reqUrl.searchParams.get("error");
      const returnedState = reqUrl.searchParams.get("state");
      const returnedCode = reqUrl.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body style="font-family:sans-serif;padding:48px">
        <h2>${error ? "Sign-in failed" : "Sign-in complete"}</h2>
        <p>${error ? error : "You can close this tab and return to the terminal."}</p>
      </body></html>`);
      server.close();
      if (error) return reject(new Error(`Authorization error: ${error} — ${reqUrl.searchParams.get("error_description") || ""}`));
      if (returnedState !== state) return reject(new Error("State mismatch (possible CSRF); aborting."));
      if (!returnedCode) return reject(new Error("No authorization code returned."));
      resolve(returnedCode);
    });
    server.on("error", (e) => reject(new Error(
      e.code === "EADDRINUSE"
        ? `Port ${port} is in use — stop the dashboard first (it must be off so this can catch the redirect).`
        : e.message)));
    server.listen(port, () => {
      console.log("");
      console.log("→ Opening your browser to sign in to Autodesk …");
      console.log("  Approve the consent screen (it now includes write access).");
      console.log("  If no browser opens, paste this URL manually:");
      console.log(`  ${authUrl}`);
      console.log("");
    });
    openBrowser(authUrl);
  });

  return { code, verifier };
}

async function exchange(code, verifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code_verifier: verifier,
  });
  const res = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

(async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("APS_CLIENT_ID / APS_CLIENT_SECRET missing from env.");

  console.log("Autodesk one-time sign-in (repairs token + grants data:write)");
  console.log(`  identity (DB row): ${USER_EMAIL}`);
  console.log(`  redirect:          ${REDIRECT_URI}`);

  const { code, verifier } = await getCode();
  const tok = await exchange(code, verifier);

  const grantedScope = tok.scope || SCOPE;
  console.log(`  ✓ signed in. Granted scope: ${grantedScope}`);
  if (!/\bdata:write\b/.test(grantedScope)) {
    console.error("  ✗ data:write was NOT granted — the reopen will fail. Re-run and accept the write consent.");
    process.exit(1);
  }

  // Persist into the dashboard's Account row (repair + upgrade).
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true },
  });
  if (!acct) {
    console.error(`  ✗ No autodesk Account row for ${USER_EMAIL} to update.`);
    process.exit(1);
  }
  const expiresAt = Math.floor(Date.now() / 1000) + (tok.expires_in || 3600);
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? undefined,
      expires_at: expiresAt,
      scope: grantedScope,
    },
  });
  console.log("  ✓ dashboard token repaired + upgraded in the database.");

  // Hand the fresh access token to the reopen step (avoids any refresh/race).
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tokenFile = path.join(OUT_DIR, "aps-access-token.json");
  fs.writeFileSync(tokenFile, JSON.stringify({
    access_token: tok.access_token,
    scope: grantedScope,
    expires_at: expiresAt,
  }, null, 2));
  console.log(`  ✓ access token saved for the reopen step → ${tokenFile}`);
  console.log("");
  console.log("Next: restart the dashboard, then run the reopen with --token-file.");
})()
  .catch((err) => { console.error("error:", err.message || err); process.exit(1); })
  .finally(() => prisma.$disconnect());
