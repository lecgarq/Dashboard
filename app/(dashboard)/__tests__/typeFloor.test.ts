/**
 * DESIGN.md §3 type floor: nothing on a workshop surface renders below 11px.
 *
 * The four routes below are presented on a projector. Sub-floor type there is
 * disproportionately the honesty apparatus — coverage caveats, "inherited"
 * markers, data-floor notes — so it is exactly the text that must survive the
 * back of the room.
 *
 * This is a SOURCE scan, not a render test: the sizes are literals in the JSX,
 * and a literal is what regresses. A rule with no runnable check rots (the §9
 * radius cap in this repo was violated 27× while the checked zinc rule held at
 * zero), so the check lives here rather than in prose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Route trees critiqued as workshop surfaces. */
const GUARDED = [
  "access-analysis",
  "template-mty",
  "forma-proposal",
  "users",
];

/** Sub-floor Tailwind arbitrary sizes: text-[7px] … text-[10.5px]. */
const TAILWIND_SUB_FLOOR = /text-\[(?:[0-9]|10)(?:\.[0-9]+)?px\]/g;
/** Sub-floor numeric font sizes: fontSize={9} / fontSize: 10 / fontSize={8.5 / k}. */
const NUMERIC_SUB_FLOOR = /fontSize\s*[:=]\s*\{?\s*(?:[0-9]|10)(?:\.[0-9]+)?\b/g;

function sourceFiles(): string[] {
  return GUARDED.flatMap((route) =>
    globSync(`${route}/**/*.{ts,tsx}`, { cwd: ROOT })
      .filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes("__tests__"))
      .map((f) => path.join(ROOT, f)),
  );
}

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles()) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(new RegExp(pattern.source, "g"))) {
        hits.push(`${path.relative(ROOT, file)}:${i + 1}  ${m[0]}`);
      }
    });
  }
  return hits;
}

describe("type floor (DESIGN.md §3 — 11px) on the workshop routes", () => {
  it("finds source files to scan", () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it("has no Tailwind text size below 11px", () => {
    expect(offenders(TAILWIND_SUB_FLOOR)).toEqual([]);
  });

  it("has no numeric fontSize below 11", () => {
    expect(offenders(NUMERIC_SUB_FLOOR)).toEqual([]);
  });
});
