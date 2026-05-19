import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("mathLayer purity (MATH-05)", () => {
  it("imports no React, DOM, engine, or persistence modules — has zero imports total", () => {
    const src = readFileSync(resolve(__dirname, "./mathLayer.ts"), "utf8");
    const specifiers = [
      ...src.matchAll(/import\s+(?:[^"';]+from\s+)?["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map(m => m[1]);
    expect(specifiers).toEqual([]);
  });

  it("contains no forbidden module identifiers in source text", () => {
    const src = readFileSync(resolve(__dirname, "./mathLayer.ts"), "utf8");
    // Defensive: even type-only references via `///<reference>` or jsdoc @import should not appear
    const forbidden = ["react", "next/", "three", "d3-force", "react-force-graph", "duckdb-wasm", "apache-arrow"];
    for (const term of forbidden) {
      expect(src.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("contains no Math.random or Date.now calls (determinism)", () => {
    const src = readFileSync(resolve(__dirname, "./mathLayer.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random\b/);
    expect(src).not.toMatch(/Date\.now\b/);
    expect(src).not.toMatch(/new Date\b/);
  });
});
