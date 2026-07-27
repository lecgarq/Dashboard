import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCheck } from "./check.cjs";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFixtureFile(rootDir: string, relativePath: string): void {
  const filePath = join(rootDir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "export {};\n");
}

function fixture({
  circular = false,
  depError = false,
  depWarningCount = 0,
  astRuleCounts = [] as Array<{ id: string; count: number }>,
  baselineAstRuleCounts = [] as Array<{ id: string; count: number }>,
  baselineAstRuleFiles = [] as Array<{ id: string; files: string[] }>,
  baselineDependencyWarningCount = 1,
  baselineDependencyWarningEdges = [] as Array<{ id: string; from: string; to: string }>,
  existingFiles = [] as string[],
} = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "repo-map-check-"));
  const rootDir = join(dir, "root");
  mkdirSync(join(dir, "baselines"), { recursive: true });
  mkdirSync(rootDir, { recursive: true });
  existingFiles.forEach((file) => writeFixtureFile(rootDir, file));
  writeJson(join(dir, "manifest.json"), { generatedAt: "test" });
  writeJson(join(dir, "dependency-cruiser.json"), {
    modules: [
      {
        source: "app/page.tsx",
        dependencies:
          depWarningCount > 0
            ? Array.from({ length: depWarningCount }, (_, index) => ({
                module: "components/x",
                resolved: `components/x-${index}.tsx`,
                circular,
                rules: [
                  ...(depError ? [{ name: "no-components-to-app", severity: "error" }] : []),
                  { name: "no-scripts-to-app", severity: "warn" },
                ],
              }))
            : [
                {
                  module: "components/x",
                  resolved: "components/x.tsx",
                  circular,
                  rules: depError ? [{ name: "no-components-to-app", severity: "error" }] : [],
                },
              ],
      },
    ],
  });
  writeJson(join(dir, "ast-grep-report.json"), {
    ruleScan: {
      matchCount: astRuleCounts.reduce((sum, item) => sum + item.count, 0),
      ruleCounts: astRuleCounts,
    },
  });
  writeJson(join(dir, "baselines", "ast-grep-baseline.json"), {
    ruleCounts: baselineAstRuleCounts,
    ruleFiles: baselineAstRuleFiles,
  });
  writeJson(join(dir, "baselines", "dependency-cruiser-baseline.json"), {
    warningCounts: [{ id: "no-scripts-to-app", count: baselineDependencyWarningCount }],
    warningEdges: baselineDependencyWarningEdges,
  });
  return dir;
}

describe("repo-map quality gate", () => {
  it("passes with dependency warnings when errors and circular imports are absent", () => {
    const result = runCheck({ repoMapDir: fixture({ depWarningCount: 1 }) });
    expect(result.ok).toBe(true);
    expect(result.dependencyCruiser.errorCount).toBe(0);
    expect(result.dependencyCruiser.warningCount).toBe(1);
  });

  it("fails when dependency-cruiser reports an error", () => {
    const result = runCheck({ repoMapDir: fixture({ depError: true }) });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("dependency-cruiser has 1 error(s).");
  });

  it("fails when circular imports are detected", () => {
    const result = runCheck({ repoMapDir: fixture({ circular: true }) });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Circular imports detected: 1.");
  });

  it("fails only on ast-grep findings above the baseline", () => {
    const atBaseline = runCheck({
      repoMapDir: fixture({
        astRuleCounts: [{ id: "direct-prisma-in-ui", count: 1 }],
        baselineAstRuleCounts: [{ id: "direct-prisma-in-ui", count: 1 }],
      }),
    });
    expect(atBaseline.ok).toBe(true);

    const overBaseline = runCheck({
      repoMapDir: fixture({
        astRuleCounts: [{ id: "direct-prisma-in-ui", count: 2 }],
        baselineAstRuleCounts: [{ id: "direct-prisma-in-ui", count: 1 }],
      }),
    });
    expect(overBaseline.ok).toBe(false);
    expect(overBaseline.failures).toContain("ast-grep rule direct-prisma-in-ui has 1 new finding(s).");
  });

  it("fails when dependency warnings exceed the baseline budget", () => {
    const result = runCheck({
      repoMapDir: fixture({
        depWarningCount: 2,
        baselineDependencyWarningCount: 1,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("dependency-cruiser rule no-scripts-to-app has 1 warning(s) above baseline.");
  });

  it("fails when an ast-grep baseline file no longer exists", () => {
    const repoMapDir = fixture({
      existingFiles: ["app/live.ts"],
      baselineAstRuleFiles: [{ id: "direct-prisma-in-ui", files: ["app/live.ts", "app/deleted.ts"] }],
    });

    const result = runCheck({ repoMapDir, rootDir: join(repoMapDir, "root") });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("ast-grep baseline references missing file: app/deleted.ts.");
  });

  it("fails when a dependency baseline edge references a missing file", () => {
    const repoMapDir = fixture({
      existingFiles: ["app/live.ts"],
      baselineDependencyWarningEdges: [
        { id: "no-scripts-to-app", from: "scripts/deleted.ts", to: "app/live.ts" },
      ],
    });

    const result = runCheck({ repoMapDir, rootDir: join(repoMapDir, "root") });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("dependency-cruiser baseline references missing file: scripts/deleted.ts.");
  });
});
