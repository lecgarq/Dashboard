const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const pgBase = path.join(root, ".local", "postgresql18");
const dataDir = path.join(pgBase, "data");
const logFile = path.join(pgBase, "postgres.log");
const port = "5432";

function bin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(pgBase, "pgsql", "bin", exe);
}

function ensureLocalInstall() {
  if (!fs.existsSync(bin("pg_ctl")) || !fs.existsSync(dataDir)) {
    console.error(
      "Local PostgreSQL binaries/data were not found under .local/postgresql18."
    );
    process.exit(1);
  }
}

function run(file, args) {
  const result = spawnSync(file, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }

  return 1;
}

function probe() {
  return spawnSync(bin("pg_isready"), ["-h", "localhost", "-p", port, "-U", "postgres"], {
    cwd: root,
    stdio: "ignore",
  }).status ?? 1;
}

function status() {
  ensureLocalInstall();
  return run(bin("pg_isready"), ["-h", "localhost", "-p", port, "-U", "postgres"]);
}

function start() {
  ensureLocalInstall();
  if (probe() === 0) {
    console.log(`PostgreSQL is already accepting connections on localhost:${port}.`);
    process.exit(0);
  }

  const code = run(bin("pg_ctl"), [
    "-D",
    dataDir,
    "-l",
    logFile,
    "-o",
    `-p ${port}`,
    "start",
  ]);

  if (code !== 0) {
    process.exit(code);
  }

  process.exit(status());
}

function stop() {
  ensureLocalInstall();
  if (probe() === 0) {
    process.exit(run(bin("pg_ctl"), ["-D", dataDir, "stop", "-m", "fast"]));
  }

  console.log("PostgreSQL is not running.");
  process.exit(0);
}

const command = process.argv[2] ?? "status";

switch (command) {
  case "start":
    start();
    break;
  case "stop":
    stop();
    break;
  case "status":
    process.exit(status());
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
