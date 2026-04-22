// Run: node scripts/get-drive-token.mjs
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env

import { readFileSync } from "fs";
import { createServer } from "http";
import { google } from "googleapis";

// Load .env manually (no dotenv dependency needed)
const envLines = readFileSync(".env", "utf8").split("\n");
for (const line of envLines) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3333/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  // Full drive scope required: create files, list folders, read existing wiki-media folder
  scope: ["https://www.googleapis.com/auth/drive"],
  prompt: "select_account consent",
});

// Spin up a temporary local server to catch the redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3333");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (!code) {
    res.writeHead(400);
    res.end(`Error: ${error || "no code received"}`);
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>✅ Authorized! You can close this tab and check your terminal.</h2>");
    server.close();

    console.log("\n✅ Success! Add these to Railway:\n");
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
  } catch (err) {
    res.writeHead(500);
    res.end(`Failed: ${err.message}`);
    server.close();
    console.error("\n❌ Token exchange failed:", err.message);
  }
});

server.listen(3333, () => {
  console.log("\nBEFORE opening the URL, add this to your Google OAuth client's");
  console.log("Authorized redirect URIs in Google Console:\n");
  console.log("  http://localhost:3333/callback\n");
  console.log("Then open this URL in an incognito window:\n");
  console.log(authUrl);
  console.log("\nWaiting for Google to redirect back...");
});
