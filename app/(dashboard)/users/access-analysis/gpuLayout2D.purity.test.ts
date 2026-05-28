import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("gpuLayout2D purity", () => {
  it("has zero import statements (fully standalone)", () => {
    const src = readFileSync(resolve(__dirname, "./gpuLayout2D.ts"), "utf8");
    const specifiers = [
      ...src.matchAll(/import\s+(?:[^"';]+from\s+)?["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(specifiers).toEqual([]);
  });

  it("references no React, DOM, engine, or renderer modules", () => {
    const src = readFileSync(resolve(__dirname, "./gpuLayout2D.ts"), "utf8").toLowerCase();
    for (const term of ["react", "next/", "three", "d3-force", "cosmos", "duckdb", "apache-arrow", "physicslayer"]) {
      expect(src).not.toContain(term);
    }
  });

  it("is deterministic — no Math.random or clock access", () => {
    const src = readFileSync(resolve(__dirname, "./gpuLayout2D.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random\b/);
    expect(src).not.toMatch(/Date\.now\b/);
    expect(src).not.toMatch(/new Date\b/);
  });
});
