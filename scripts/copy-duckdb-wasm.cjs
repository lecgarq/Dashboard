#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const SRC_DIR = path.join(__dirname, "..", "node_modules", "@duckdb", "duckdb-wasm", "dist");
const DST_DIR = path.join(__dirname, "..", "public", "duckdb-wasm");
const FILES = [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
];

if (!fs.existsSync(SRC_DIR)) {
  console.log("[duckdb-wasm] source dir missing; skipping (run pnpm install first)");
  process.exit(0);
}

fs.mkdirSync(DST_DIR, { recursive: true });

for (const file of FILES) {
  const src = path.join(SRC_DIR, file);
  const dst = path.join(DST_DIR, file);
  if (!fs.existsSync(src)) {
    console.warn(`[duckdb-wasm] missing ${src}`);
    continue;
  }
  fs.copyFileSync(src, dst);
}
console.log(`[duckdb-wasm] copied ${FILES.length} files to public/duckdb-wasm`);
