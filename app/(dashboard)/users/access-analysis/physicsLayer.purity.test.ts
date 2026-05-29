import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(__dirname, "physicsLayer.ts");
const src = readFileSync(SRC_PATH, "utf8");

// Extract import specifiers via regex (same approach as mathLayer.purity.test.ts).
const importRe = /import\s+(?:[\s\S]*?)from\s+["']([^"']+)["']/g;
const specifiers: string[] = [];
let match: RegExpExecArray | null;
while ((match = importRe.exec(src)) !== null) {
  specifiers.push(match[1]);
}

describe("physicsLayer purity", () => {
  it("only imports from the allowed allowlist", () => {
    // physicsLayer.ts is allowed: d3-force-3d, ./positionsCache, ./duckdbClient,
    // and ./sliderCalibration (a pure, zero-import slider→force response curve).
    // It must NOT import React, Next.js, rendering engines, or DOM utilities.
    const ALLOWED = new Set([
      "d3-force-3d",
      "./positionsCache",
      "./duckdbClient",
      "./sliderCalibration",
    ]);
    for (const spec of specifiers) {
      expect(ALLOWED.has(spec), `Disallowed import: ${spec}`).toBe(true);
    }
  });

  it("has zero React or react-force-graph imports", () => {
    const forbidden = [
      "react",
      "react-dom",
      "react-force-graph-2d",
      "react-force-graph-3d",
      "three",
      "next/",
    ];
    for (const term of forbidden) {
      const hit = specifiers.some((s) => s === term || s.startsWith(term));
      expect(hit, `Forbidden import detected: ${term}`).toBe(false);
    }
  });

  it("has zero DOM API references in source", () => {
    // Quick static scan: physics must run in node env without any DOM access
    const forbidden = [
      "document.",
      "window.",
      "requestAnimationFrame(",
      "HTMLElement",
      "HTMLCanvas",
    ];
    for (const term of forbidden) {
      expect(src.includes(term), `Forbidden DOM reference: ${term}`).toBe(false);
    }
  });
});
