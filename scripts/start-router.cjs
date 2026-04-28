/**
 * Production start router.
 * Set SERVICE_TYPE=yjs in Railway env vars for the Yjs service.
 * Dashboard service needs no extra env var.
 */

if (process.env.SERVICE_TYPE === "yjs") {
  // Use dynamic import for the ESM Yjs server
  import("./yjs-server.mjs").catch(err => {
    console.error("[router] Failed to start Yjs server:", err);
    process.exit(1);
  });
} else {
  require("./start-production.cjs");
}

