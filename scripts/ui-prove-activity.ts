/**
 * Interactive proof: opens /access-analysis as admin, scrolls to "Activity by
 * role", clicks a role to drill in, clicks a person, and screenshots the profile
 * drawer that opens — proving the new click→profile wiring end to end.
 */
import { config as loadEnv } from "dotenv";
import { encode } from "@auth/core/jwt";
import { Client } from "pg";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const COOKIE = "authjs.session-token";
const MAX_AGE = 30 * 24 * 60 * 60;
const OUT = "C:/LECG/Dashboard/.ui-shots";

async function main() {
  loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL! });
  await client.connect();
  const { rows } = await client.query<{ id: string; email: string; name: string | null }>(
    'SELECT id, email, name FROM "User" WHERE lower(email)=lower($1) LIMIT 1', [process.env.ADMIN_EMAIL!]);
  await client.end();
  const u = rows[0];
  const token = await encode({ salt: COOKIE, secret: process.env.AUTH_SECRET!, maxAge: MAX_AGE,
    token: { sub: u.id, name: u.name ?? "", email: u.email, role: "ADMIN", isPrimaryAdmin: true, hasCredentials: true, providers: [], moduleAccess: [] } });

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: "light" });
  await ctx.addCookies([{ name: COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + MAX_AGE }]);
  const page = await ctx.newPage();

  await page.goto("http://localhost:3000/access-analysis", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  const legend = page.getByTestId("activity-role-legend");
  await legend.scrollIntoViewIfNeeded({ timeout: 15000 });
  await page.waitForTimeout(500);
  await legend.locator("button").first().click(); // drill into a role
  await page.waitForTimeout(800);
  const drill = page.getByTestId("activity-role-drilldown");
  await drill.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/activity-drilldown.png` });
  // Person rows live inside the <ul>; the panel's first button is the ✕ close.
  const people = drill.locator("ul button:not([disabled])");
  console.log("person buttons:", await people.count());

  // Click the first PERSON row -> should open the profile drawer.
  await people.first().click();
  await page.waitForTimeout(2500);
  const drawer = page.getByTestId("author-profile-drawer");
  const drawerVisible = await drawer.isVisible().catch(() => false);
  console.log("drawer visible:", drawerVisible, "url:", page.url());
  await page.screenshot({ path: `${OUT}/activity-profile-open.png` });

  await browser.close();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
