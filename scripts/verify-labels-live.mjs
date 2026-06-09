/**
 * verify-labels-live.mjs — Drives the LIVE :3000 production build (the deployed labels
 * fix, real data) to prove the projector-map name chips ride their clusters across the
 * Grouping-strength morph. Mints a real admin Auth.js cookie (same shape as the e2e
 * global-setup), opens /users/spatial-graph, drags the strength slider, and screenshots
 * at mid + full strength. Screenshots go to the path printed at the end.
 */
import { chromium } from "@playwright/test";
import { encode } from "@auth/core/jwt";
import pg from "pg";
import { config as loadEnv } from "dotenv";

loadEnv();

const COOKIE_NAME = "authjs.session-token";
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.VERIFY_OUT_DIR ?? "C:/Users/luis.cortes/AppData/Local/Temp/labelframes";

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function mintCookie() {
  const secret = req("AUTH_SECRET");
  const adminEmail = req("ADMIN_EMAIL");
  const client = new pg.Client({ connectionString: req("DATABASE_URL") });
  await client.connect();
  let row;
  try {
    const r = await client.query(
      'SELECT id, email, role, name FROM "User" WHERE lower(email)=lower($1) LIMIT 1',
      [adminEmail],
    );
    if (!r.rows.length) throw new Error(`No User for ADMIN_EMAIL=${adminEmail}`);
    row = r.rows[0];
  } finally {
    await client.end();
  }
  const token = await encode({
    salt: COOKIE_NAME,
    secret,
    maxAge: 30 * 24 * 3600,
    token: {
      sub: row.id, name: row.name ?? "", email: row.email, role: "ADMIN",
      isPrimaryAdmin: true, hasCredentials: true, providers: [], moduleAccess: [],
    },
  });
  return { name: COOKIE_NAME, value: token, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" };
}

async function setStrengthPct(page, pct) {
  // Click the Radix track at the given fraction → sets the thumb directly (reliable;
  // keyboard stepping fought the ~60ms rAF-throttled value commit).
  const root = page.getByLabel("Grouping strength slider");
  const box = await root.boundingBox();
  const x = box.x + (box.width * Math.min(pct, 98)) / 100; // 98 cap: the very edge can miss
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
  const thumb = page.getByLabel("Grouping strength thumb");
  return Number(await thumb.getAttribute("aria-valuenow"));
}

async function setMax(page) {
  const thumb = page.getByLabel("Grouping strength thumb");
  await thumb.focus();
  await page.keyboard.press("End"); // Radix slider → max (100)
  await page.waitForTimeout(400);
  return Number(await thumb.getAttribute("aria-valuenow"));
}

// Tight clip framing exactly the labeled cluster region (canvas-local chip coords +
// the labels-container screen origin), so the screenshot is legible (not downscaled).
async function tightClip(page, chips) {
  if (!chips.length) return undefined;
  const origin = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="map-cluster-labels"]');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const xs = chips.map((c) => c.x);
  const ys = chips.map((c) => c.y);
  const M = 100;
  const x = Math.max(0, origin.left + Math.min(...xs) - M);
  const y = Math.max(0, origin.top + Math.min(...ys) - M);
  return { x, y, width: Math.max(...xs) - Math.min(...xs) + 2 * M, height: Math.max(...ys) - Math.min(...ys) + 2 * M };
}

async function chipReport(page) {
  return await page.evaluate(() => {
    const cont = document.querySelector('[data-testid="map-cluster-labels"]');
    const base = cont?.getBoundingClientRect();
    const chips = [];
    document.querySelectorAll('[data-testid="map-cluster-label"]').forEach((el) => {
      if (el.style.opacity === "0") return;
      const r = el.getBoundingClientRect();
      chips.push({ label: (el.textContent || "").trim(), x: Math.round(r.left + r.width / 2 - (base?.left ?? 0)), y: Math.round(r.top + r.height / 2 - (base?.top ?? 0)) });
    });
    return chips;
  });
}

const cookie = await mintCookie();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([cookie]);
const page = await ctx.newPage();

console.log(`[verify] goto ${BASE}/users/spatial-graph`);
await page.goto(`${BASE}/users/spatial-graph`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
await page.getByTestId("group-by-select").waitFor({ state: "visible", timeout: 60_000 });
const groupBy = await page.getByTestId("group-by-select").inputValue();
console.log(`[verify] group-by = ${groupBy}; waiting for snapshot to settle...`);
await page.waitForTimeout(9_000);

const steps = [
  { name: "50", set: () => setStrengthPct(page, 50) },
  { name: "100", set: () => setMax(page) },
];
for (const step of steps) {
  const landed = await step.set();
  await page.waitForTimeout(4_000); // ease + camera reframe settle
  const chips = await chipReport(page);
  const clip = await tightClip(page, chips);
  const file = `${OUT}/labels-after-${step.name}.png`;
  await page.screenshot({ path: file, clip });
  console.log(`[verify] strength~${landed}: ${chips.length} chips → ${file}`);
  console.log(`[verify]   chips: ${chips.map((c) => `${c.label}(${c.x},${c.y})`).join(", ")}`);
}

await browser.close();
console.log("[verify] done");
