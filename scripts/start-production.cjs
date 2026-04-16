/**
 * Production startup script for Railway.
 * Starts Next.js and the ngrok tunnel agent together.
 * Set NGROK_AUTHTOKEN and NGROK_DOMAIN in Railway environment variables.
 */

const { spawn } = require("child_process");
const ngrok = require("@ngrok/ngrok");

// Start Next.js
const port = process.env.PORT || "3000";
const nextApp = spawn("node_modules/.bin/next", ["start", "-H", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  env: process.env,
});

nextApp.on("error", (err) => {
  console.error("[next] Failed to start:", err);
  process.exit(1);
});

nextApp.on("exit", (code) => {
  console.error(`[next] Exited with code ${code}`);
  process.exit(code ?? 1);
});

// Start ngrok tunnel (connects to localhost:3000)
async function startTunnel() {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  const domain = process.env.NGROK_DOMAIN;

  if (!authtoken || !domain) {
    console.warn("[ngrok] NGROK_AUTHTOKEN or NGROK_DOMAIN not set — skipping tunnel");
    return;
  }

  try {
    const listener = await ngrok.forward({
      addr: 3000,
      authtoken,
      domain,
    });
    console.log(`[ngrok] Tunnel active: ${listener.url()}`);
  } catch (err) {
    console.error("[ngrok] Failed to start tunnel (app continues without tunnel):", err.message ?? err);
  }
}

startTunnel();

process.on("SIGTERM", () => {
  nextApp.kill("SIGTERM");
  process.exit(0);
});

process.on("SIGINT", () => {
  nextApp.kill("SIGINT");
  process.exit(0);
});
