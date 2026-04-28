/**
 * Production startup script for Railway.
 * Starts Next.js and the ngrok tunnel agent together.
 * Set NGROK_AUTHTOKEN and NGROK_DOMAIN in Railway environment variables.
 */

const { spawn } = require("child_process");
const ngrok = require("@ngrok/ngrok");

// Start Next.js
// Cap heap at 460 MB so V8 gives a clean OOM error before the Railway container
// (typically 512 MB) gets killed by the OS, making the crash easier to diagnose.
const port = process.env.PORT || "3000";
const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
const nodeOptions = existingNodeOptions.includes("--max-old-space-size")
  ? existingNodeOptions
  : `${existingNodeOptions} --max-old-space-size=460`.trim();
const nextApp = spawn("node_modules/.bin/next", ["start", "-H", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

nextApp.on("error", (err) => {
  console.error("[next] Failed to start:", err);
  process.exit(1);
});

nextApp.on("exit", (code) => {
  console.error(`[next] Exited with code ${code}`);
  process.exit(code ?? 1);
});

// Start LOD Engine (Python) if enabled
let lodEngine = null;
if (process.env.ENABLE_LOD === "true") {
  console.log("[prod] Starting LOD Engine (Python)...");
  lodEngine = spawn("python", ["services/lod-engine/server.py"], {
    stdio: "inherit",
    env: process.env,
  });

  lodEngine.on("error", (err) => {
    console.error("[lod] Failed to start:", err);
  });

  lodEngine.on("exit", (code) => {
    console.warn([lod] Exited with code \);
  });
}

// Start ngrok tunnel (connects to localhost:3000)
async function startTunnel(retries = 5, delayMs = 8000) {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  const domain = process.env.NGROK_DOMAIN;

  if (!authtoken || !domain) {
    console.warn("[ngrok] NGROK_AUTHTOKEN or NGROK_DOMAIN not set — skipping tunnel");
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const listener = await ngrok.forward({
        addr: parseInt(process.env.PORT || "3000"),
        authtoken,
        domain,
      });
      console.log(`[ngrok] Tunnel active: ${listener.url()}`);
      return;
    } catch (err) {
      const msg = err.message ?? String(err);
      if (attempt < retries && msg.includes("already online")) {
        console.warn(`[ngrok] Endpoint busy, retrying in ${delayMs / 1000}s (attempt ${attempt}/${retries})...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error("[ngrok] Failed to start tunnel (app continues without tunnel):", msg);
        return;
      }
    }
  }
}

startTunnel();

process.on("SIGTERM", () => {
  nextApp.kill("SIGTERM");`n  if (lodEngine) lodEngine.kill("SIGTERM");
  process.exit(0);
});

process.on("SIGINT", () => {
  nextApp.kill("SIGINT");`n  if (lodEngine) lodEngine.kill("SIGINT");
  process.exit(0);
});

