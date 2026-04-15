#!/usr/bin/env node

const ngrok = require("@ngrok/ngrok");
const { loadEnvFile, validatePublicEnv } = require("./env-utils.cjs");

async function main() {
  const { values } = loadEnvFile();
  const LOCAL_PORT = parseInt(values.TUNNEL_PORT || process.env.TUNNEL_PORT || "3000", 10);
  
  console.log(`[tunnel] Resolving local address...`);
  if (isNaN(LOCAL_PORT)) {
    throw new Error(`Invalid port detected: ${values.TUNNEL_PORT || process.env.TUNNEL_PORT}`);
  }
  const publicConfig = validatePublicEnv(values);

  const checkOnly = process.argv.includes("--check");
  if (checkOnly) {
    console.log(`[tunnel] Validation passed. Domain: ${publicConfig.ngrokDomain}`);
    return;
  }

  const authtoken = values.NGROK_AUTHTOKEN;
  const domain = publicConfig.ngrokDomain;

  if (!authtoken) {
    throw new Error("NGROK_AUTHTOKEN is required in .env");
  }
  if (!domain) {
    throw new Error("NGROK_DOMAIN is required in .env");
  }

  console.log(`[tunnel] Starting ngrok tunnel...`);
  console.log(`[tunnel] Forwarding https://${domain} → http://localhost:${LOCAL_PORT}`);

  const listener = await ngrok.forward({
    addr: `127.0.0.1:${LOCAL_PORT}`,
    authtoken,
    domain,
  });

  console.log(`[tunnel] Tunnel established: ${listener.url()}`);
  console.log(`[tunnel] Public URL: https://${domain}`);

  // Keep the process alive — ngrok SDK doesn't hold the event loop open
  const keepAlive = setInterval(() => {}, 60000);

  const shutdown = async () => {
    console.log("\n[tunnel] Shutting down ngrok tunnel...");
    clearInterval(keepAlive);
    await ngrok.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(`[tunnel] ${error.message}`);
  process.exit(1);
});
