#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const BLOCKING_AST_RULES = new Set(["direct-prisma-in-ui"]);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countDependencyCruiser(dependencyCruiser) {
  const ruleCounts = new Map();
  const circularEdges = [];

  for (const mod of dependencyCruiser.modules || []) {
    for (const rule of mod.rules || []) {
      const severity = rule.severity || "unknown";
      const name = rule.name || "unknown";
      const key = `${severity}:${name}`;
      ruleCounts.set(key, (ruleCounts.get(key) || 0) + 1);
    }

    for (const dep of mod.dependencies || []) {
      if (dep.circular) {
        circularEdges.push({
          from: mod.source,
          to: dep.resolved || dep.module || "unknown",
        });
      }

      for (const rule of dep.rules || []) {
        const severity = rule.severity || "unknown";
        const name = rule.name || "unknown";
        const key = `${severity}:${name}`;
        ruleCounts.set(key, (ruleCounts.get(key) || 0) + 1);
      }
    }
  }

  const rules = [...ruleCounts.entries()]
    .map(([key, count]) => {
      const [severity, ...nameParts] = key.split(":");
      return { severity, id: nameParts.join(":"), count };
    })
    .sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));

  return {
    errorCount: rules.filter((rule) => rule.severity === "error").reduce((sum, rule) => sum + rule.count, 0),
    warningCount: rules.filter((rule) => rule.severity === "warn").reduce((sum, rule) => sum + rule.count, 0),
    circularImportCount: circularEdges.length,
    circularEdges,
    rules,
  };
}

function normalizeRuleCounts(ruleCounts = []) {
  const counts = new Map();
  for (const item of ruleCounts) {
    const id = item.id || item.ruleId;
    if (!id) {
      continue;
    }
    counts.set(id, Number(item.count) || 0);
  }
  return counts;
}

function countAstGrep(astReport) {
  const ruleCounts = astReport?.ruleScan?.ruleCounts || [];
  return {
    totalCount: astReport?.ruleScan?.matchCount || 0,
    ruleCounts,
    byRule: normalizeRuleCounts(ruleCounts),
  };
}

function compareBlockingAstRules(astGrep, astBaseline) {
  const failures = [];
  const baselineCounts = normalizeRuleCounts(astBaseline?.ruleCounts || []);

  for (const ruleId of BLOCKING_AST_RULES) {
    const current = astGrep.byRule.get(ruleId) || 0;
    const baseline = baselineCounts.get(ruleId) || 0;
    const delta = current - baseline;
    if (delta > 0) {
      failures.push(`ast-grep rule ${ruleId} has ${delta} new finding(s).`);
    }
  }

  return failures;
}

function compareDependencyWarningBudget(dependencyCruiser, dependencyBaseline) {
  const failures = [];
  const baselineCounts = normalizeRuleCounts(dependencyBaseline?.warningCounts || []);

  for (const rule of dependencyCruiser.rules.filter((item) => item.severity === "warn")) {
    const baseline = baselineCounts.get(rule.id) || 0;
    const delta = rule.count - baseline;
    if (delta > 0) {
      failures.push(`dependency-cruiser rule ${rule.id} has ${delta} warning(s) above baseline.`);
    }
  }

  return failures;
}

function normalizeBaselinePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return "";
  }
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function baselinePathExists(rootDir, filePath) {
  const normalized = normalizeBaselinePath(filePath);
  if (!normalized || normalized.startsWith("node:")) {
    return true;
  }
  return fs.existsSync(path.isAbsolute(normalized) ? normalized : path.join(rootDir, normalized));
}

function collectAstBaselinePaths(astBaseline) {
  const paths = new Set();

  for (const group of astBaseline?.ruleFiles || []) {
    for (const file of group.files || []) {
      const normalized = normalizeBaselinePath(file);
      if (normalized) {
        paths.add(normalized);
      }
    }
  }

  for (const finding of astBaseline?.findings || []) {
    const normalized = normalizeBaselinePath(finding.file || finding.path);
    if (normalized) {
      paths.add(normalized);
    }
  }

  return [...paths].sort();
}

function collectDependencyBaselinePaths(dependencyBaseline) {
  const paths = new Set();

  for (const edge of dependencyBaseline?.warningEdges || []) {
    for (const file of [edge.from, edge.to]) {
      const normalized = normalizeBaselinePath(file);
      if (normalized) {
        paths.add(normalized);
      }
    }
  }

  return [...paths].sort();
}

function validateBaselineFiles({ astBaseline, dependencyBaseline, rootDir }) {
  const failures = [];

  for (const file of collectAstBaselinePaths(astBaseline)) {
    if (!baselinePathExists(rootDir, file)) {
      failures.push(`ast-grep baseline references missing file: ${file}.`);
    }
  }

  for (const file of collectDependencyBaselinePaths(dependencyBaseline)) {
    if (!baselinePathExists(rootDir, file)) {
      failures.push(`dependency-cruiser baseline references missing file: ${file}.`);
    }
  }

  return failures;
}

function runCheck(options = {}) {
  const repoMapDir = options.repoMapDir || path.join(process.cwd(), ".tools", "repo-map");
  const rootDir = options.rootDir || process.cwd();
  const failures = [];
  const warnings = [];

  const manifestPath = path.join(repoMapDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      failures: ["Missing repo-map manifest."],
      warnings,
      dependencyCruiser: {
        errorCount: 0,
        warningCount: 0,
        circularImportCount: 0,
        circularEdges: [],
        rules: [],
      },
      astGrep: {
        totalCount: 0,
        ruleCounts: [],
      },
    };
  }

  const manifest = readJson(manifestPath, {});
  const dependencyCruiserJson = readJson(path.join(repoMapDir, "dependency-cruiser.json"), { modules: [] });
  const astReport = readJson(path.join(repoMapDir, "ast-grep-report.json"), {});
  const astBaseline = readJson(path.join(repoMapDir, "baselines", "ast-grep-baseline.json"), { ruleCounts: [] });
  const dependencyBaseline = readJson(path.join(repoMapDir, "baselines", "dependency-cruiser-baseline.json"), {
    warningCounts: [],
  });

  const dependencyCruiser = countDependencyCruiser(dependencyCruiserJson);
  const astGrep = countAstGrep(astReport);

  if (dependencyCruiser.errorCount > 0) {
    failures.push(`dependency-cruiser has ${dependencyCruiser.errorCount} error(s).`);
  }
  if (dependencyCruiser.circularImportCount > 0) {
    failures.push(`Circular imports detected: ${dependencyCruiser.circularImportCount}.`);
  }

  failures.push(...compareBlockingAstRules(astGrep, astBaseline));
  failures.push(...compareDependencyWarningBudget(dependencyCruiser, dependencyBaseline));
  failures.push(...validateBaselineFiles({ astBaseline, dependencyBaseline, rootDir }));

  if (dependencyCruiser.warningCount > 0) {
    warnings.push(`dependency-cruiser has ${dependencyCruiser.warningCount} warning(s).`);
  }
  if (astGrep.totalCount > 0) {
    warnings.push(`ast-grep has ${astGrep.totalCount} finding(s), checked against baseline for blocking rules.`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    manifest,
    dependencyCruiser,
    dependencyBaseline,
    astGrep: {
      totalCount: astGrep.totalCount,
      ruleCounts: astGrep.ruleCounts,
    },
    astBaseline,
  };
}

function printResult(result) {
  for (const warning of result.warnings) {
    console.warn(`WARN: ${warning}`);
  }

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`ERROR: ${failure}`);
    }
    return;
  }

  console.log("Repo-map quality gate passed.");
}

if (require.main === module) {
  const result = runCheck();
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  BLOCKING_AST_RULES,
  compareDependencyWarningBudget,
  countAstGrep,
  countDependencyCruiser,
  collectAstBaselinePaths,
  collectDependencyBaselinePaths,
  normalizeRuleCounts,
  runCheck,
  validateBaselineFiles,
};
