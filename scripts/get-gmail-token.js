/**
 * One-time setup: obtain a Gmail OAuth2 refresh token for sending email.
 *
 * Prerequisites:
 *   1. In Google Cloud Console → OAuth credentials → your OAuth 2.0 Client ID,
 *      add this to Authorized redirect URIs:
 *        https://developers.google.com/oauthplayground
 *   2. Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are in your .env file.
 *
 * Usage:
 *   node scripts/get-gmail-token.js
 */

const { google } = require("googleapis");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

// Load .env without requiring dotenv dependency.
function loadDotEnvFallback() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

try {
  require("dotenv").config();
} catch {
  loadDotEnvFallback();
}

function getFirstConfiguredEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

const clientId = getFirstConfiguredEnv([
  "GMAIL_OAUTH_CLIENT_ID",
  "GOOGLE_CLIENT_ID-FOR-MAIL",
  "GOOGLE_CLIENT_ID",
]);
const clientSecret = getFirstConfiguredEnv([
  "GMAIL_OAUTH_CLIENT_SECRET",
  "GOOGLE_SECRET_ID-FOR-MAIL",
  "GOOGLE_CLIENT_SECRET",
]);
const redirectUri =
  process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
  "https://developers.google.com/oauthplayground";

if (!clientId || !clientSecret) {
  console.error(
    "ERROR: Missing Gmail OAuth client credentials. Set GMAIL_OAUTH_CLIENT_ID/GMAIL_OAUTH_CLIENT_SECRET (or fallback GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)."
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://mail.google.com/"],
  prompt: "consent",
});

console.log("\n─────────────────────────────────────────────");
console.log("Gmail OAuth2 Refresh Token Setup");
console.log("─────────────────────────────────────────────");
console.log("\nStep 1: Make sure this URI is in your Google Cloud Console OAuth credentials:");
console.log(`        ${redirectUri}`);
console.log("\nStep 2: Visit this URL and authorize with your Gmail account:\n");
console.log(authUrl);
console.log();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Step 3: Paste the authorization code here: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    if (!tokens.refresh_token) {
      console.error("\nERROR: No refresh_token received. Make sure you added prompt: 'consent' and are authorizing fresh.");
      process.exit(1);
    }
    console.log("\n─────────────────────────────────────────────");
    console.log("Add these to your .env file:");
    console.log("─────────────────────────────────────────────");
    console.log(`GMAIL_USER=<your-gmail-address>`);
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("─────────────────────────────────────────────\n");
  } catch (err) {
    console.error("\nERROR: Failed to exchange code for tokens:", err.message);
    process.exit(1);
  }
});
