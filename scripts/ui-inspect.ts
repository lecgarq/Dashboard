/**
 * One-off visual inspector: mints the same admin NextAuth cookie the e2e suite
 * uses (playwright/global-setup.ts), drives a real Chromium against the LIVE
 * :3000 server, and screenshots /template-mty and /access-analysis so we can see
 * the actual rendered UI. Not wired into anything; run with `npx tsx`.
 */
import { config as loadEnv } from "dotenv";
import { encode } from "@auth/core/jwt";
import { Client } from "pg";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const COOKIE_NAME = "authjs.session-token";
const MAX_AGE = 30 * 24 * 60 * 60;
const OUT = "C:/LECG/Dashboard/.ui-shots";
const BASE = process.env.UI_BASE ?? "http://localhost:3000";

async function main() {
  loadEnv();
  const secret = process.env.AUTH_SECRET!;
  const adminEmail = process.env.ADMIN_EMAIL!;
  const databaseUrl = process.env.DATABASE_URL!;
  if (!secret || !adminEmail || !databaseUrl) throw new Error("missing AUTH_SECRET/ADMIN_EMAIL/DATABASE_URL");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const res = await client.query<{ id: string; email: string; role: string; name: string | null }>(
    'SELECT id, email, role, name FROM "User" WHERE lower(email) = lower($1) LIMIT 1',
    [adminEmail],
  );
  await client.end();
  if (res.rows.length === 0) throw new Error(`no User for ${adminEmail}`);
  const row = res.rows[0];

  const token = await encode({
    salt: COOKIE_NAME,
    secret,
    maxAge: MAX_AGE,
    token: {
      sub: row.id, name: row.name ?? "", email: row.email, role: "ADMIN",
      isPrimaryAdmin: true, hasCredentials: true, providers: [], moduleAccess: [],
    },
  });

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: theme });
    await ctx.addCookies([{
      name: COOKIE_NAME, value: token, domain: "localhost", path: "/",
      httpOnly: true, secure: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + MAX_AGE,
    }]);
    const page = await ctx.newPage();
    for (const [route, name] of [["/template-mty", "template-mty"], ["/access-analysis", "access-analysis"]] as const) {
      try {
        await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3500); // let ECharts/animations settle
        await page.screenshot({ path: `${OUT}/${name}-${theme}-top.png` });
        await page.screenshot({ path: `${OUT}/${name}-${theme}-full.png`, fullPage: true });
        console.log(`shot ${name} (${theme}) url=${page.url()}`);
      } catch (e) {
        console.log(`FAILED ${name} (${theme}):`, (e as Error).message, "url=", page.url());
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log("done →", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
