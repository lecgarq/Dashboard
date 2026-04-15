const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");
const APS_CALLBACK_PATH = "/api/auth/callback/autodesk";

function stripWrappingQuotes(value) {
  if (!value) return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvContent(content) {
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    values[key] = stripWrappingQuotes(rawValue);
  }

  return values;
}

function loadEnvFile(envPath = ENV_PATH) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env file not found at ${envPath}`);
  }

  const content = fs.readFileSync(envPath, "utf8");
  return {
    envPath,
    content,
    values: parseEnvContent(content),
  };
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (regex.test(content)) {
    const nextContent = content.replace(regex, line);
    return {
      changed: nextContent !== content,
      content: nextContent,
    };
  }

  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  return {
    changed: true,
    content: `${content}${suffix}${line}\n`,
  };
}

function parseRequiredUrl(values, key) {
  const value = values[key];
  if (!value) {
    throw new Error(`${key} is required in .env`);
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL, received "${value}"`);
  }
}

function validatePublicEnv(values) {
  const nextAuthUrl = parseRequiredUrl(values, "NEXTAUTH_URL");
  const authUrl = parseRequiredUrl(values, "AUTH_URL");
  const apsCallbackUrl = parseRequiredUrl(values, "APS_CALLBACK_URL");

  if (nextAuthUrl.origin !== authUrl.origin) {
    throw new Error(
      `NEXTAUTH_URL and AUTH_URL must share the same origin. Received "${nextAuthUrl.origin}" and "${authUrl.origin}".`
    );
  }

  if (apsCallbackUrl.origin !== authUrl.origin) {
    throw new Error(
      `APS_CALLBACK_URL must use the same origin as AUTH_URL. Received "${apsCallbackUrl.origin}" and "${authUrl.origin}".`
    );
  }

  if (apsCallbackUrl.pathname !== APS_CALLBACK_PATH) {
    throw new Error(
      `APS_CALLBACK_URL must use the Autodesk callback path "${APS_CALLBACK_PATH}". Received "${apsCallbackUrl.pathname}".`
    );
  }

  const publicHostname = authUrl.hostname.toLowerCase();
  const ngrokMatch = /\.ngrok-free\.dev$/i.test(publicHostname);

  return {
    publicOrigin: authUrl.origin,
    publicHost: authUrl.host.toLowerCase(),
    publicHostname,
    ngrokDomain: ngrokMatch ? publicHostname : null,
  };
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (
        iface.family === "IPv4" &&
        !iface.internal &&
        !iface.address.startsWith("169.254")
      ) {
        return iface.address;
      }
    }
  }

  return "127.0.0.1";
}

module.exports = {
  ENV_PATH,
  getLocalIP,
  loadEnvFile,
  setEnvValue,
  validatePublicEnv,
};
