/**
 * Production start router.
 * Set SERVICE_TYPE=yjs in Railway env vars for the Yjs service.
 * Dashboard service needs no extra env var.
 */

if (process.env.SERVICE_TYPE === "yjs") {
  require("./yjs-server.cjs");
} else {
  require("./start-production.cjs");
}
