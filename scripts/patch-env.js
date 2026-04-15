const fs = require("fs");
const {
  getLocalIP,
  loadEnvFile,
  setEnvValue,
  validatePublicEnv,
} = require("./env-utils.cjs");

function patchEnv() {
  const { envPath, content, values } = loadEnvFile();
  const publicConfig = validatePublicEnv(values);
  const currentIP = getLocalIP();

  console.log(`Public auth origin preserved: ${publicConfig.publicOrigin}`);
  console.log(`Current LAN IP: ${currentIP}`);

  let envContent = content;
  let modified = false;

  const dynamicValues = [
    ["NEXT_PUBLIC_LOD_CHECKER_URL", `http://${currentIP}:5173`],
    ["NEXT_PUBLIC_YJS_WS_URL", `ws://${currentIP}:4444`],
  ];

  for (const [key, value] of dynamicValues) {
    const result = setEnvValue(envContent, key, value);
    envContent = result.content;
    if (result.changed) {
      console.log(`Updated ${key} to ${value}`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log(".env dynamic values updated successfully.");
  } else {
    console.log(".env dynamic values are already up to date.");
  }
}

try {
  patchEnv();
} catch (error) {
  console.error(`[patch-env] ${error.message}`);
  process.exit(1);
}
