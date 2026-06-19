#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  BLOCKING_AST_RULES,
  compareDependencyWarningBudget,
  countAstGrep,
  countDependencyCruiser,
  normalizeRuleCounts,
  validateBaselineFiles
} = require("./check.cjs");

const root = path.resolve(__dirname, "..", "..");
const outDir = path.join(root, ".tools", "repo-map");
const logPath = path.join(outDir, "repo-map-run.log");

const sourceInputs = [
  "app",
  "components",
  "lib",
  "server",
  "hooks",
  "scripts",
  "electron",
  "tests",
  "types",
  "adapters",
  "services",
  "dashboard-app",
  "auth.config.ts",
  "instrumentation.ts",
  "knip.ts",
  "next.config.ts",
  "next.config.test.ts",
  "playwright.config.ts",
  "playwright.verify.config.ts",
  "prisma.config.ts",
  "proxy.ts",
  "vitest.config.ts",
  "vitest.setup.ts"
].filter((entry) => fs.existsSync(path.join(root, entry)));

const mode = process.argv[2] || "--all";
const modeArg = process.argv[3];

const dependencyCruiserInputs = sourceInputs.filter((entry) => entry !== "knip.ts");

const repomixZoneIgnorePatterns = [
  ".tools/**",
  ".planning/**",
  ".planning.backup/**",
  ".next*/**",
  ".tmp/**",
  "docs/archive/**",
  "docs/superpowers/**",
  "logs/**",
  "node_modules/**",
  "playwright-report/**",
  "public/duckdb-wasm/**",
  "scratch/**",
  "scripts/scratch/**",
  "scripts/_attic/**",
  "services/lod-engine/Categories.json",
  "services/lod-engine/img_pipeline/bin/**",
  "test-results/**",
  "tmp/**",
  "**/*.db",
  "**/*.gif",
  "**/*.jpg",
  "**/*.lock",
  "**/*.log",
  "**/*.mov",
  "**/*.png",
  "**/*.tsbuildinfo",
  "**/*.xlsx",
  "package-lock.json"
];

const repomixZones = [
  { id: "app", paths: ["app"] },
  { id: "components", paths: ["components"] },
  { id: "server", paths: ["server", "lib", "prisma"] },
  { id: "scripts", paths: ["scripts"] },
  {
    id: "config",
    paths: [
      "auth.config.ts",
      "instrumentation.ts",
      "knip.ts",
      "next.config.ts",
      "next.config.test.ts",
      "package.json",
      "playwright.config.ts",
      "playwright.verify.config.ts",
      "postcss.config.mjs",
      "prisma.config.ts",
      "proxy.ts",
      "repomix.config.json",
      "sgconfig.yml",
      "tsconfig.json",
      "vitest.config.ts",
      "vitest.setup.ts"
    ]
  }
];

function localBin(name) {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return path.join(root, "node_modules", ".bin", `${name}${suffix}`);
}

function ensureOutDir() {
  fs.mkdirSync(outDir, { recursive: true });
  const separator = fs.existsSync(logPath) ? "\n---\n" : "";
  fs.appendFileSync(logPath, `${separator}repo-map run ${new Date().toISOString()} ${mode}\n\n`);
}

function appendLog(message) {
  fs.appendFileSync(logPath, `${message}\n`);
}

function run(command, args, options = {}) {
  const printable = `${path.relative(root, command) || command} ${args.join(" ")}`;
  console.log(`> ${printable}`);
  appendLog(`> ${printable}`);

  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
    shell: process.platform === "win32",
    windowsHide: true
  });

  if (options.stdoutFile) {
    fs.writeFileSync(options.stdoutFile, result.stdout || "");
  }

  if (result.stdout && !options.stdoutFile) {
    appendLog(result.stdout.trimEnd());
  }
  if (result.stderr) {
    appendLog(result.stderr.trimEnd());
  }

  if (result.error) {
    appendLog(`ERROR: ${result.error.message}`);
    if (!options.allowFailure) {
      throw result.error;
    }
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${printable} exited with ${result.status}`);
  }

  if (result.status !== 0 && options.allowFailure) {
    appendLog(`WARN: command exited with ${result.status}; continuing because output may still be useful.`);
  }

  return result;
}

function generateRepomix() {
  run(localBin("repomix"), ["--config", "repomix.config.json"]);
}

function generateRepomixZone(zone) {
  const zoneDir = path.join(outDir, "repomix");
  fs.mkdirSync(zoneDir, { recursive: true });
  const outputFile = path.join(zoneDir, `${zone.id}.xml`);
  const existingPaths = zone.paths.filter((entry) => fs.existsSync(path.join(root, entry)));
  if (existingPaths.length === 0) {
    appendLog(`WARN: skipping empty Repomix zone ${zone.id}`);
    return;
  }

  const configDir = path.join(root, ".tmp", "repo-map-zone-configs");
  fs.mkdirSync(configDir, { recursive: true });
  const zoneConfigPath = path.join(configDir, `${zone.id}.json`);
  const include = existingPaths.map((entry) => {
    const stat = fs.statSync(path.join(root, entry));
    return stat.isDirectory() ? `${entry}/**/*` : entry;
  });

  fs.writeFileSync(
    zoneConfigPath,
    `${JSON.stringify(
      {
        output: {
          filePath: toPosix(path.relative(root, outputFile)),
          style: "xml",
          compress: true,
          fileSummary: true,
          directoryStructure: true,
          files: true,
          topFilesLength: 20,
          tokenCountTree: 1000
        },
        include,
        ignore: {
          useGitignore: true,
          useDotIgnore: true,
          useDefaultPatterns: true,
          customPatterns: repomixZoneIgnorePatterns
        },
        security: {
          enableSecurityCheck: true
        },
        tokenCount: {
          encoding: "o200k_base"
        }
      },
      null,
      2
    )}\n`
  );

  run(localBin("repomix"), ["--config", path.relative(root, zoneConfigPath)]);
}

function generateRepomixZones() {
  for (const zone of repomixZones) {
    generateRepomixZone(zone);
  }
}

function runDepcruise(outputType, outputFile) {
  const args = [
    ...dependencyCruiserInputs,
    "--config",
    ".dependency-cruiser.cjs",
    "--progress",
    "none",
    "--output-type",
    outputType,
    "--output-to",
    path.relative(root, outputFile)
  ];

  run(localBin("depcruise"), args, { allowFailure: true });
}

function generateDependencyCruiser() {
  runDepcruise("json", path.join(outDir, "dependency-cruiser.json"));
  runDepcruise("err-html", path.join(outDir, "dependency-cruiser-report.html"));
  runDepcruise("dot", path.join(outDir, "dependency-graph.dot"));
  runDepcruise("mermaid", path.join(outDir, "dependency-graph.mmd"));

  const jsonPath = path.join(outDir, "dependency-cruiser.json");
  if (!fs.existsSync(jsonPath) || fs.statSync(jsonPath).size === 0) {
    throw new Error("dependency-cruiser JSON was not generated");
  }
}

function hasGraphvizDot() {
  const result = childProcess.spawnSync("dot", ["-V"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true
  });
  return result.status === 0 || /graphviz/i.test(`${result.stdout || ""}${result.stderr || ""}`);
}

function renderDependencyGraph(cruise) {
  const dotPath = path.join(outDir, "dependency-graph.dot");
  const svgPath = path.join(outDir, "dependency-graph.svg");

  if (hasGraphvizDot()) {
    run("dot", ["-T", "svg", "-o", path.relative(root, svgPath), path.relative(root, dotPath)], {
      allowFailure: true
    });
    if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
      return "graphviz";
    }
  }

  generateSvgGraph(cruise);
  return "fallback";
}

const astQueries = [
  {
    id: "react-use-effect",
    lang: "tsx",
    pattern: "useEffect($$$)",
    paths: ["app", "components", "hooks", "lib"]
  },
  {
    id: "router-push",
    lang: "tsx",
    pattern: "router.push($$$)",
    paths: ["app", "components", "hooks", "lib"]
  },
  {
    id: "prisma-access",
    lang: "ts",
    pattern: "prisma.$MODEL.$METHOD($$$)",
    paths: ["app", "lib", "server", "scripts"]
  },
  {
    id: "fetch-calls",
    lang: "tsx",
    pattern: "fetch($$$)",
    paths: ["app", "components", "hooks", "lib", "server", "scripts"]
  }
];

function parseJsonArray(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return [];
  }
}

function normalizeAstMatch(match) {
  return {
    file: match.file || match.path || match.filePath || "",
    range: match.range || match.byteRange || null,
    lines: match.lines || match.text || "",
    language: match.language || undefined
  };
}

function generateAstGrep() {
  const report = {
    generatedAt: new Date().toISOString(),
    queries: [],
    ruleScan: null
  };

  for (const query of astQueries) {
    const paths = query.paths.filter((entry) => fs.existsSync(path.join(root, entry)));
    const result = run(
      localBin("sg"),
      [
        "run",
        "--pattern",
        query.pattern,
        "--lang",
        query.lang,
        "--json=pretty",
        ...paths
      ],
      {
        stdoutFile: path.join(outDir, `ast-grep-${query.id}.json`),
        allowFailure: true
      }
    );

    const raw = fs.readFileSync(path.join(outDir, `ast-grep-${query.id}.json`), "utf8");
    const matches = parseJsonArray(raw);
    report.queries.push({
      id: query.id,
      pattern: query.pattern,
      lang: query.lang,
      paths,
      exitCode: result.status,
      matchCount: matches.length,
      sampleMatches: matches.slice(0, 25).map(normalizeAstMatch)
    });
  }

  const ruleScanPath = path.join(outDir, "ast-grep-rules.json");
  const ruleScan = run(localBin("sg"), ["scan", "--config", "sgconfig.yml", "--json=pretty"], {
    stdoutFile: ruleScanPath,
    allowFailure: true
  });
  const ruleMatches = parseJsonArray(fs.readFileSync(ruleScanPath, "utf8"));
  const ruleCounts = new Map();
  for (const match of ruleMatches) {
    const ruleId = match.ruleId || match.id || match.rule?.id || "unknown";
    ruleCounts.set(ruleId, (ruleCounts.get(ruleId) || 0) + 1);
  }

  report.ruleScan = {
    exitCode: ruleScan.status,
    matchCount: ruleMatches.length,
    ruleCounts: [...ruleCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    sampleMatches: ruleMatches.slice(0, 25).map(normalizeAstMatch)
  };

  fs.writeFileSync(path.join(outDir, "ast-grep-report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

function bucketForModule(modulePath) {
  if (!modulePath) {
    return "unresolved";
  }

  const normalized = modulePath.replaceAll("\\", "/").replace(/^.\//, "");
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) {
    return "external npm";
  }
  if (/^(node:)?[a-z_]+$/.test(normalized)) {
    return "node core";
  }

  const first = normalized.split("/")[0];
  const known = new Set([
    "app",
    "components",
    "lib",
    "server",
    "hooks",
    "scripts",
    "electron",
    "tests",
    "types",
    "adapters",
    "services",
    "dashboard-app",
    "prisma"
  ]);
  if (known.has(first)) {
    return first;
  }
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx") || normalized.endsWith(".js") || normalized.endsWith(".cjs") || normalized.endsWith(".mjs")) {
    return "root config";
  }
  return first || "other";
}

function readDependencyCruiserJson() {
  return JSON.parse(fs.readFileSync(path.join(outDir, "dependency-cruiser.json"), "utf8"));
}

function getDependencyEdges(cruise) {
  const edges = new Map();
  const unresolved = [];
  const circular = [];

  for (const mod of cruise.modules || []) {
    const from = bucketForModule(mod.source);
    for (const dep of mod.dependencies || []) {
      let to = "unresolved";
      if (dep.coreModule) {
        to = "node core";
      } else if (dep.resolved) {
        to = bucketForModule(dep.resolved);
      } else if (dep.module) {
        to = bucketForModule(dep.module);
      }

      if (dep.couldNotResolve) {
        unresolved.push({ source: mod.source, module: dep.module });
      }
      if (dep.circular) {
        circular.push({ source: mod.source, module: dep.module, cycle: dep.cycle });
      }
      if (from === to) {
        continue;
      }
      const key = `${from} -> ${to}`;
      const existing = edges.get(key) || { from, to, count: 0 };
      existing.count += 1;
      edges.set(key, existing);
    }
  }

  return {
    edges: [...edges.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)),
    unresolved,
    circular
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function generateSvgGraph(cruise) {
  const graph = getDependencyEdges(cruise);
  const topEdges = graph.edges.slice(0, 45);
  const nodeNames = [...new Set(topEdges.flatMap((edge) => [edge.from, edge.to]))].sort();
  const width = 1400;
  const height = 900;
  const centerX = width / 2;
  const centerY = height / 2 + 25;
  const radiusX = 520;
  const radiusY = 310;
  const positions = new Map();

  nodeNames.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodeNames.length, 1) - Math.PI / 2;
    positions.set(node, {
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle)
    });
  });

  const maxCount = Math.max(1, ...topEdges.map((edge) => edge.count));
  const edgeSvg = topEdges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      const opacity = 0.18 + (edge.count / maxCount) * 0.62;
      const strokeWidth = 1 + (edge.count / maxCount) * 6;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      return [
        `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="#516072" stroke-width="${strokeWidth.toFixed(2)}" stroke-opacity="${opacity.toFixed(2)}" marker-end="url(#arrow)" />`,
        `<text x="${midX.toFixed(1)}" y="${midY.toFixed(1)}" class="edge-label">${edge.count}</text>`
      ].join("\n");
    })
    .join("\n");

  const nodeSvg = nodeNames
    .map((node) => {
      const position = positions.get(node);
      const inbound = topEdges.filter((edge) => edge.to === node).reduce((sum, edge) => sum + edge.count, 0);
      const outbound = topEdges.filter((edge) => edge.from === node).reduce((sum, edge) => sum + edge.count, 0);
      const total = inbound + outbound;
      const widthForNode = Math.max(110, Math.min(190, 70 + node.length * 8));
      return [
        `<g transform="translate(${(position.x - widthForNode / 2).toFixed(1)} ${(position.y - 24).toFixed(1)})">`,
        `<rect width="${widthForNode}" height="48" rx="8" fill="#f8fafc" stroke="#1f2937" stroke-width="1.3" />`,
        `<text x="${widthForNode / 2}" y="21" class="node-title">${escapeXml(node)}</text>`,
        `<text x="${widthForNode / 2}" y="37" class="node-meta">${total} cross edges</text>`,
        "</g>"
      ].join("\n");
    })
    .join("\n");

  const legend = topEdges
    .slice(0, 12)
    .map((edge, index) => {
      const y = 70 + index * 22;
      return `<text x="1030" y="${y}" class="legend">${escapeXml(edge.from)} -> ${escapeXml(edge.to)} (${edge.count})</text>`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L8,3 z" fill="#516072" fill-opacity="0.72" />
    </marker>
    <style>
      .title { font: 700 24px Arial, sans-serif; fill: #111827; }
      .subtitle { font: 400 13px Arial, sans-serif; fill: #4b5563; }
      .node-title { font: 700 13px Arial, sans-serif; fill: #111827; text-anchor: middle; }
      .node-meta { font: 400 10px Arial, sans-serif; fill: #6b7280; text-anchor: middle; }
      .edge-label { font: 700 10px Arial, sans-serif; fill: #334155; text-anchor: middle; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; }
      .legend { font: 400 12px Arial, sans-serif; fill: #374151; }
      .legend-title { font: 700 14px Arial, sans-serif; fill: #111827; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="40" y="44" class="title">Dashboard dependency graph</text>
  <text x="40" y="66" class="subtitle">Top cross-area edges generated from dependency-cruiser JSON. Edge labels are import counts.</text>
  <text x="1030" y="42" class="legend-title">Strongest cross-area edges</text>
  ${edgeSvg}
  ${nodeSvg}
  ${legend}
</svg>
`;

  fs.writeFileSync(path.join(outDir, "dependency-graph.svg"), svg);
}

function walkFiles(start, predicate, results = []) {
  if (!fs.existsSync(start)) {
    return results;
  }
  const stat = fs.statSync(start);
  if (stat.isFile()) {
    if (predicate(start, stat)) {
      results.push({ file: start, size: stat.size });
    }
    return results;
  }
  if (!stat.isDirectory()) {
    return results;
  }

  const ignoredDirs = new Set(["node_modules", ".git", ".next", ".tmp", "tmp", "logs", "playwright-report", "test-results", ".tools"]);
  for (const entry of fs.readdirSync(start)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }
    walkFiles(path.join(start, entry), predicate, results);
  }
  return results;
}

function countFilesByRoot() {
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".prisma", ".md"]);
  return sourceInputs.reduce((acc, entry) => {
    const full = path.join(root, entry);
    const files = walkFiles(full, (file) => extensions.has(path.extname(file)));
    acc[entry] = files.length;
    return acc;
  }, {});
}

function largestSourceFiles() {
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
  const files = [];
  for (const entry of sourceInputs) {
    walkFiles(path.join(root, entry), (file, stat) => {
      if (!extensions.has(path.extname(file))) {
        return false;
      }
      files.push({ file, size: stat.size });
      return false;
    });
  }
  return files
    .sort((a, b) => b.size - a.size)
    .slice(0, 12)
    .map((item) => `${toPosix(path.relative(root, item.file))} (${Math.round(item.size / 1024)} KB)`);
}

function parseRootRouterNames() {
  const rootRouterPath = path.join(root, "server", "routers", "root.ts");
  if (!fs.existsSync(rootRouterPath)) {
    return [];
  }
  const text = fs.readFileSync(rootRouterPath, "utf8");
  return [...text.matchAll(/^\s*([A-Za-z0-9_]+):\s*[A-Za-z0-9_]+Router\b/gm)].map((match) => match[1]).sort();
}

function parsePrismaModels() {
  const schemaPath = path.join(root, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    return [];
  }
  const text = fs.readFileSync(schemaPath, "utf8");
  return [...text.matchAll(/^model\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]).sort();
}

function readAstReport() {
  const reportPath = path.join(outDir, "ast-grep-report.json");
  if (!fs.existsSync(reportPath)) {
    return { queries: [] };
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getQualityMetrics(cruise) {
  const astReport = readJsonIfExists(path.join(outDir, "ast-grep-report.json"), {});
  const astBaseline = readJsonIfExists(path.join(outDir, "baselines", "ast-grep-baseline.json"), { ruleCounts: [] });
  const dependencyBaseline = readJsonIfExists(path.join(outDir, "baselines", "dependency-cruiser-baseline.json"), {
    warningCounts: []
  });

  const dependencyCruiser = countDependencyCruiser(cruise || { modules: [] });
  const astGrep = countAstGrep(astReport);
  const astBaselineCounts = normalizeRuleCounts(astBaseline.ruleCounts || []);
  const astBlockingRules = [...BLOCKING_AST_RULES].sort().map((id) => {
    const current = astGrep.byRule.get(id) || 0;
    const baseline = astBaselineCounts.get(id) || 0;
    return {
      id,
      current,
      baseline,
      delta: current - baseline
    };
  });
  const newBlockingAstFindings = astBlockingRules.reduce((sum, rule) => sum + Math.max(0, rule.delta), 0);
  const warningBudgetFailures = compareDependencyWarningBudget(dependencyCruiser, dependencyBaseline);
  const staleBaselineFailures = validateBaselineFiles({ astBaseline, dependencyBaseline, rootDir: root });

  return {
    dependencyCruiser,
    dependencyBaseline,
    astGrep: {
      totalCount: astGrep.totalCount,
      ruleCounts: astGrep.ruleCounts
    },
    astBaseline,
    astBlockingRules,
    newBlockingAstFindings,
    warningBudgetFailures,
    staleBaselineFailures,
    ok:
      dependencyCruiser.errorCount === 0 &&
      dependencyCruiser.circularImportCount === 0 &&
      newBlockingAstFindings === 0 &&
      warningBudgetFailures.length === 0 &&
      staleBaselineFailures.length === 0
  };
}

function qualityGateRows(quality) {
  const blockingCurrent = quality.astBlockingRules.reduce((sum, rule) => sum + rule.current, 0);
  const blockingBaseline = quality.astBlockingRules.reduce((sum, rule) => sum + rule.baseline, 0);
  const astBlockingStatus =
    quality.newBlockingAstFindings > 0 ? "Fail" : blockingCurrent > 0 ? "Baseline" : "Pass";
  const astBlockingCount =
    blockingBaseline > 0 ? `${blockingCurrent} / baseline ${blockingBaseline}` : String(blockingCurrent);

  return [
    {
      gate: "Circular imports",
      status: quality.dependencyCruiser.circularImportCount > 0 ? "Fail" : "Pass",
      count: String(quality.dependencyCruiser.circularImportCount),
      failsCi: "Yes"
    },
    {
      gate: "Dependency errors",
      status: quality.dependencyCruiser.errorCount > 0 ? "Fail" : "Pass",
      count: String(quality.dependencyCruiser.errorCount),
      failsCi: "Yes"
    },
    {
      gate: "Dependency warnings",
      status: quality.warningBudgetFailures.length > 0 ? "Fail" : quality.dependencyCruiser.warningCount > 0 ? "Warn" : "Pass",
      count: String(quality.dependencyCruiser.warningCount),
      failsCi: "Growth only"
    },
    {
      gate: "AST blocking rules",
      status: astBlockingStatus,
      count: astBlockingCount,
      failsCi: "New only"
    },
    {
      gate: "AST warnings/info/hints",
      status: quality.astGrep.totalCount > 0 ? "Report" : "Pass",
      count: String(quality.astGrep.totalCount),
      failsCi: "No"
    },
    {
      gate: "Baseline file refs",
      status: quality.staleBaselineFailures.length > 0 ? "Fail" : "Pass",
      count: String(quality.staleBaselineFailures.length),
      failsCi: "Yes"
    }
  ];
}

function qualityGateTable(quality) {
  const rows = qualityGateRows(quality)
    .map((row) => `| ${row.gate} | ${row.status} | ${row.count} | ${row.failsCi} |`)
    .join("\n");
  return `| Gate | Status | Count | Fails CI |\n|---|---:|---:|---:|\n${rows}\n`;
}

function getRuleViolations(cruise) {
  const violations = [];
  for (const mod of cruise.modules || []) {
    for (const rule of mod.rules || []) {
      violations.push({
        from: mod.source,
        to: "",
        name: rule.name || "unknown",
        severity: rule.severity || "unknown"
      });
    }
    for (const dep of mod.dependencies || []) {
      for (const rule of dep.rules || []) {
        violations.push({
          from: mod.source,
          to: dep.resolved || dep.module || "",
          name: rule.name || "unknown",
          severity: rule.severity || "unknown"
        });
      }
    }
  }
  return violations;
}

function summarizeViolations(violations) {
  const counts = new Map();
  for (const violation of violations) {
    const key = `${violation.severity}:${violation.name}`;
    const current = counts.get(key) || { severity: violation.severity, name: violation.name, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()]
    .sort((a, b) => {
      const severityRank = { error: 0, warn: 1, info: 2, ignore: 3, unknown: 4 };
      return (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || b.count - a.count;
    })
    .map((item) => `${item.severity} ${item.name}: ${item.count}`);
}

function summarizeCircular(circular) {
  return circular
    .slice(0, 20)
    .map((item) => `${item.source} -> ${item.module || "unknown"}`);
}

function bulletList(items) {
  if (!items.length) {
    return "- None detected in the generated data.\n";
  }
  return items.map((item) => `- ${item}`).join("\n") + "\n";
}

function dependencyWarningTriageTable(violations) {
  const warnings = violations.filter((violation) => violation.severity === "warn");
  if (!warnings.length) {
    return "| Warning | Classification | Action |\n|---|---|---|\n| None | Clean | No action needed |\n";
  }

  const rows = warnings.map((warning) => {
    const from = warning.from || "unknown";
    const to = warning.to || "unknown";
    const classification = warning.name === "no-scripts-to-app" ? "Technical debt" : "Needs review";
    const action =
      warning.name === "no-scripts-to-app"
        ? "Move the shared helper into lib/server or scripts/lib, or document a narrow exception"
        : "Fix, allow narrowly, or document after manual review";
    return `| ${warning.name}: \`${from}\` -> \`${to}\` | ${classification} | ${action} |`;
  });

  return `| Warning | Classification | Action |\n|---|---|---|\n${rows.join("\n")}\n`;
}

function generateArchitectureSummary(cruise) {
  const graph = getDependencyEdges(cruise);
  const violations = getRuleViolations(cruise);
  const quality = getQualityMetrics(cruise);
  const counts = countFilesByRoot();
  const routers = parseRootRouterNames();
  const models = parsePrismaModels();
  const ast = readAstReport();
  const largestFiles = largestSourceFiles();
  const topEdges = graph.edges.slice(0, 10).map((edge) => `${edge.from} -> ${edge.to}: ${edge.count} imports`);
  const astCounts = ast.queries.map((query) => `${query.id}: ${query.matchCount} matches`);
  const ruleCounts = ast.ruleScan?.ruleCounts?.map((rule) => `${rule.id}: ${rule.count} matches`) ?? [];
  const violationSummary = summarizeViolations(violations);
  const warningTriageTable = dependencyWarningTriageTable(violations);
  const circularSummary = summarizeCircular(graph.circular);
  const rootCounts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([rootName, count]) => `${rootName}: ${count} mapped files`);

  const summary = `# Codebase Architecture Summary

Generated: ${new Date().toISOString()}

Inputs:
- Repomix compressed whole-repo snapshot: \`.tools/repo-map/repomix-output.xml\`
- Repomix architecture slices: \`.tools/repo-map/repomix/app.xml\`, \`components.xml\`, \`server.xml\`, \`scripts.xml\`, \`config.xml\`
- dependency-cruiser graph/report: \`.tools/repo-map/dependency-cruiser.json\`, \`.tools/repo-map/dependency-cruiser-report.html\`, \`.tools/repo-map/dependency-graph.svg\`
- ast-grep structural search snapshots: \`.tools/repo-map/ast-grep-report.json\`
- AI analysis prompt: \`.tools/repo-map/AI-ANALYSIS-PROMPT.md\`

## Opinionated Takeaways

- Start AI review with the manifest, this summary, dependency-cruiser JSON/report, and ast-grep report. Load Repomix zone files only when the question needs source context.
- Treat \`app -> lib\`, \`app -> components\`, \`components -> lib\`, and \`server -> lib\` as expected high-traffic edges. Treat \`lib -> app\`, \`server -> components\`, \`components -> app\`, and UI-to-DB imports as design smells.
- The ACC/Data Connector area is the largest domain and should get the first dedicated boundary cleanup pass.
- Large UI files in the users/access-analysis surfaces are the most likely places where data fetching, transformation, visualization, and interaction state are coupled.
- Dependency errors, circular imports, and new blocking ast-grep findings are now quality-gate failures. Dependency warnings and legacy AST findings stay visible but non-blocking.

## Quality Gate Status

${qualityGateTable(quality)}

## 1. App Architecture

This repository is a Next.js App Router dashboard backed by tRPC routers, Prisma/Postgres data access, Autodesk Platform Services integrations, Google APIs, collaborative editing infrastructure, and a Python LOD engine. The main UI surface lives in \`app/\` and \`components/\`, shared client/server code lives in \`lib/\`, request boundaries live in \`server/routers/\`, database schema lives in \`prisma/schema.prisma\`, operational scripts live in \`scripts/\`, and the Python image/LOD service lives in \`services/lod-engine/\`.

Mapped source density:
${bulletList(rootCounts)}
## 2. Feature Modules

Prominent feature areas in the current tree:
- ACC/Data Connector activity ingestion, members, folders, graphing, and sync: \`server/routers/acc-*.ts\`, \`lib/acc/\`, \`scripts/acc-*.cjs\`, \`scripts/dc-*.cjs\`
- Access analysis and permission terrain UI: \`app/(dashboard)/users/access-analysis/\`, \`app/(dashboard)/template-mty/\`
- Dashboard collaboration and communication surfaces: \`components/dashboard/\`, \`lib/google/\`, \`server/routers/chat.ts\`, \`server/routers/gmail.ts\`, \`server/routers/calendar.ts\`
- Forma proposal and role modeling helpers: \`lib/forma/\`, \`tests/e2e/forma-proposal.spec.ts\`
- LOD/image processing service: \`services/lod-engine/\`
- Wiki/media routes and shared module schemas: \`app/api/wiki-media/\`, \`lib/wiki/\`, \`lib/shared/\`

## Ownership Model

| Zone | Owner | Purpose | Import Direction |
|---|---|---|---|
| \`app/\` | Application routes | UI composition and route entrypoints | May import components, feature modules, and server-safe modules |
| \`components/\` | Shared UI | Reusable presentational components | Should not import app, prisma, scripts, or server/db directly |
| \`lib/server/\` | Server infrastructure | Server-only logic, adapters, and integration contracts | May import db, env, services, and provider SDKs |
| \`server/\` | API boundary | tRPC routers and request orchestration | May import lib/server, lib/domain, prisma/db helpers, and types |
| \`prisma/\` | Persistence | Database schema and migration-adjacent assets | Should not import UI or runtime app modules |
| \`scripts/\` | Tooling | Repo automation, diagnostics, backfills, and maintenance | Should be isolated from runtime app modules unless narrowly documented |

tRPC router entries detected from \`server/routers/root.ts\`:
${bulletList(routers)}
## 3. Data Flow

The primary data flow is browser UI -> Next.js route/component layer -> tRPC router -> server service/helper modules -> Prisma/Postgres or external APIs. Batch and backfill flows enter through \`scripts/\`, call Autodesk/Google/data connector clients, and write through server/lib database helpers. Python LOD processing is separate from the TypeScript request path and is started through \`npm run lod:engine\`.

Prisma models detected:
${bulletList(models)}
## 4. API Boundaries

- Next.js API routes are under \`app/api/\`.
- tRPC procedure boundaries are under \`server/routers/\` and composed by \`server/routers/root.ts\`.
- External API clients cluster under \`lib/google/\`, Autodesk/ACC related routers/scripts, and \`@aps_sdk/*\` dependencies.
- Background/ops entrypoints are command scripts in \`scripts/\`, not API routes.
- Electron is isolated under \`electron/main.cjs\`.

## 5. Database Access Layer

Prisma is the central ORM layer, with schema in \`prisma/schema.prisma\`, client generation in \`postinstall\`, and server-side DB setup in \`server/db.ts\`. Direct Prisma access should remain server-only: routers, server helpers, scripts, and migration utilities are expected places. Client components should consume tRPC/API results rather than importing database helpers.

ast-grep structural counts:
${bulletList(astCounts)}
ast-grep rule scan counts:
${bulletList(ruleCounts)}
## 6. Duplicated Responsibilities

Likely duplication or responsibility overlap to audit:
- ACC/Data Connector ingestion and graph concerns appear across \`server/routers/acc-activity.ts\`, \`server/routers/acc-sync.ts\`, \`server/routers/acc-dc-graph.ts\`, \`lib/acc/\`, and multiple \`scripts/acc-*\` / \`scripts/dc-*\` files.
- Permission/access modeling appears in both \`app/(dashboard)/template-mty/\` and \`app/(dashboard)/users/access-analysis/\`, with server-side user/folder routers also participating.
- Google communication responsibilities span \`lib/google/\`, \`components/dashboard/MailPanel.tsx\`, chat/calendar routers, and dashboard chat panel components.
- Operational diagnostics and production backfill code are mixed in \`scripts/\`; consider separating durable jobs from one-off diagnostics and scratch scripts.

## 7. Files That Should Be Atomized

Largest source files in the mapped roots:
${bulletList(largestFiles)}
These are good first candidates for atomization when they combine fetching, transformation, UI state, and rendering in one module.

## 8. Risky Dependencies

dependency-cruiser findings:
- Modules analyzed: ${(cruise.modules || []).length}
- Cross-area dependency edges: ${graph.edges.length}
- Circular dependency edges: ${quality.dependencyCruiser.circularImportCount}
- Unresolved dependency edges: ${graph.unresolved.length}
- Rule violations: ${violations.length}
- CI-blocking dependency errors: ${quality.dependencyCruiser.errorCount}
- Non-blocking dependency warnings: ${quality.dependencyCruiser.warningCount}

Strongest cross-area dependencies:
${bulletList(topEdges)}
Rule violation summary:
${bulletList(violationSummary)}
Dependency warning triage:
${warningTriageTable}
Circular import edges:
${bulletList(circularSummary)}
High-count cross-area edges are not automatically wrong, but they identify areas where boundaries are doing real work and should have explicit ownership.

## 9. Cleanup Opportunities

- Keep generated artifacts under \`.tools/repo-map/\` and avoid feeding build caches, screenshots, logs, lockfiles, and local secrets into AI context.
- Split durable operational scripts from diagnostics/scratch scripts so dependency graphs are less noisy.
- Pull shared ACC/Data Connector transformations into small typed modules under \`lib/acc/\` or \`server/services/\` and let routers/scripts call those modules.
- Keep browser-facing components from importing server-only helpers directly; enforce this with future dependency-cruiser rules once current usage is baselined.
- Consider adding focused ast-grep rules for direct Prisma usage outside approved folders and client components that call navigation or side-effect hooks in large render modules.

## 10. Recommended Folder Structure

Recommended target shape for future cleanup:
- \`app/\`: route shells, server components, and thin client entrypoints
- \`components/\`: reusable UI primitives and dashboard widgets without direct database access
- \`features/<feature>/\`: feature-specific UI, hooks, and pure transforms when a feature spans many folders
- \`server/routers/\`: tRPC boundary only
- \`server/services/\`: orchestration/business logic used by routers and jobs
- \`lib/integrations/<provider>/\`: Google, Autodesk, OpenAI, Redis, UploadThing, and other external clients
- \`lib/domain/<domain>/\`: pure domain rules for ACC, Forma, access analysis, modules, and wiki
- \`scripts/jobs/\`: repeatable production/backfill jobs
- \`scripts/diagnostics/\`: one-off inspection and verification commands
- \`services/lod-engine/\`: Python service, kept isolated behind explicit interfaces

## Priority Cleanup Roadmap

1. Safe: keep the stat-card shared types in a pure type module and prevent config/detail modules from importing the ACC profile container.
2. Safe: install Graphviz where available so \`dependency-graph.svg\` is rendered from DOT instead of the fallback top-level graph.
3. Medium risk: split large ACC/Data Connector transformations into server service modules and keep routers/scripts as entrypoints.
4. Medium risk: enforce the new dependency-cruiser errors once current violations are triaged and either fixed or explicitly allowed.
5. Needs manual verification: evaluate large files for atomization only after checking runtime coupling, UI state ownership, and test coverage.
6. Needs manual verification: treat ast-grep TODO/any/console findings as review queues, not automatic delete-or-rewrite instructions.

## How To Refresh

Run:

\`\`\`powershell
npm run repo-map:check
\`\`\`

Primary artifacts:
- \`.tools/repo-map/repomix-output.xml\`
- \`.tools/repo-map/repomix/app.xml\`
- \`.tools/repo-map/repomix/components.xml\`
- \`.tools/repo-map/repomix/server.xml\`
- \`.tools/repo-map/repomix/scripts.xml\`
- \`.tools/repo-map/repomix/config.xml\`
- \`.tools/repo-map/dependency-cruiser-report.html\`
- \`.tools/repo-map/dependency-graph.svg\`
- \`.tools/repo-map/dependency-cruiser.json\`
- \`.tools/repo-map/ast-grep-report.json\`
- \`.tools/repo-map/architecture-summary.md\`
- \`.tools/repo-map/AI-ANALYSIS-PROMPT.md\`
`;

  fs.writeFileSync(path.join(outDir, "architecture-summary.md"), summary);
}

function generateAiAnalysisPrompt() {
  const prompt = `Analyze the generated repo-map artifacts.

Start with:
- .tools/repo-map/manifest.json
- .tools/repo-map/architecture-summary.md
- .tools/repo-map/dependency-cruiser.json
- .tools/repo-map/ast-grep-report.json

Only open Repomix files when needed. Prefer the smallest useful slice first:
- .tools/repo-map/repomix/app.xml
- .tools/repo-map/repomix/components.xml
- .tools/repo-map/repomix/server.xml
- .tools/repo-map/repomix/scripts.xml
- .tools/repo-map/repomix/config.xml

Produce:

1. Current architecture map
2. Main app domains/features
3. Data flow from UI to API/server to database
4. Dependency boundary violations
5. Circular imports and exact refactor plan
6. Files that are too large or too coupled
7. Duplicated responsibilities
8. Dead/low-confidence cleanup candidates
9. Recommended folder structure
10. Priority cleanup roadmap

Be conservative. Do not suggest deleting files unless there is strong evidence from imports, references, tests, generated reports, and runtime relevance.

Classify each recommendation as:
- Safe
- Medium risk
- Needs manual verification
`;

  fs.writeFileSync(path.join(outDir, "AI-ANALYSIS-PROMPT.md"), prompt);
}

function collectArtifactFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    const relativePath = toPosix(path.relative(outDir, filePath));
    if (relativePath === path.basename(logPath) || relativePath === "manifest.json") {
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      collectArtifactFiles(filePath, files);
      continue;
    }
    files.push({ filePath, stat });
  }
  return files;
}

function generateManifest() {
  const files = collectArtifactFiles(outDir)
    .map(({ filePath, stat }) => {
      return {
        path: toPosix(path.relative(root, filePath)),
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const dependencyCruiserPath = path.join(outDir, "dependency-cruiser.json");
  const cruise = fs.existsSync(dependencyCruiserPath) ? readDependencyCruiserJson() : { modules: [] };
  const quality = getQualityMetrics(cruise);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceInputs,
    dependencyCruiserInputs,
    repomixZones: repomixZones.map((zone) => ({
      id: zone.id,
      paths: zone.paths.filter((entry) => fs.existsSync(path.join(root, entry))),
      output: `.tools/repo-map/repomix/${zone.id}.xml`
    })),
    dependencyCruiser: {
      errors: quality.dependencyCruiser.errorCount,
      warnings: quality.dependencyCruiser.warningCount,
      circulars: quality.dependencyCruiser.circularImportCount,
      rules: quality.dependencyCruiser.rules
    },
    astGrep: {
      findings: quality.astGrep.totalCount,
      ruleCounts: quality.astGrep.ruleCounts,
      blockingRules: quality.astBlockingRules
    },
    baselines: {
      dependencyCruiserWarningCounts: quality.dependencyBaseline.warningCounts || [],
      dependencyCruiserWarningEdges: quality.dependencyBaseline.warningEdges || [],
      astGrepRuleCounts: quality.astBaseline.ruleCounts || [],
      astGrepRuleFiles: quality.astBaseline.ruleFiles || []
    },
    qualityGate: {
      ok: quality.ok,
      newBlockingAstFindings: quality.newBlockingAstFindings,
      warningBudgetFailures: quality.warningBudgetFailures,
      staleBaselineFailures: quality.staleBaselineFailures,
      rows: qualityGateRows(quality)
    },
    graphvizDotAvailable: hasGraphvizDot(),
    artifacts: files
  };

  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function main() {
  ensureOutDir();

  if (mode === "--repomix-zone") {
    const zone = repomixZones.find((item) => item.id === modeArg);
    if (!zone) {
      throw new Error(`Unknown Repomix zone '${modeArg}'. Expected one of: ${repomixZones.map((item) => item.id).join(", ")}`);
    }
    generateRepomixZone(zone);
    generateManifest();
    console.log(`repo-map artifacts written to ${path.relative(root, outDir)}`);
    return;
  }

  if (mode === "--all" || mode === "--repomix-only") {
    generateRepomix();
    generateRepomixZones();
  }
  if (mode === "--repomix-zones-only") {
    generateRepomixZones();
  }
  if (mode === "--all" || mode === "--deps-only") {
    generateDependencyCruiser();
    renderDependencyGraph(readDependencyCruiserJson());
  }
  if (mode === "--all" || mode === "--ast-only") {
    generateAstGrep();
  }
  if (mode === "--all" || mode === "--summary-only") {
    const cruise = readDependencyCruiserJson();
    generateArchitectureSummary(cruise);
  }
  if (mode === "--all" || mode === "--summary-only" || mode === "--prompt-only") {
    generateAiAnalysisPrompt();
  }

  generateManifest();
  console.log(`repo-map artifacts written to ${path.relative(root, outDir)}`);
}

main();
