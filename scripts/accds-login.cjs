#!/usr/bin/env node
/**
 * One-time ACC session bootstrap for the accds crawler.
 * Opens a headed browser; you log into acc.autodesk.com (incl. MFA). On success,
 * persists the session cookies (Playwright storageState) to scratch/acc-session.json.
 * Re-run only when the crawler reports SessionExpiredError.
 *
 * NOTE: scratch/ is gitignored. The cookie file is password-equivalent — keep it local.
 *
 * Run: node scripts/accds-login.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const OUT = path.join(process.cwd(), 'scratch', 'acc-session.json');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://acc.autodesk.com');
  console.log('→ Log in to ACC in the opened window (email + MFA). Waiting up to 5 min …');
  // Wait until we are on an acc.autodesk.com app route that is NOT the sign-in page.
  await page.waitForURL((url) => url.host.endsWith('acc.autodesk.com') && !/signin/i.test(url.href), {
    timeout: 5 * 60 * 1000,
  });
  await page.waitForTimeout(5000); // let the SPA finish setting auth cookies
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await ctx.storageState({ path: OUT });
  const n = JSON.parse(fs.readFileSync(OUT, 'utf8')).cookies.length;
  console.log(`✓ session saved → ${OUT} (${n} cookies)`);
  await browser.close();
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
