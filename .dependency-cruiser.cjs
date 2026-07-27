/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment: "Circular imports make feature boundaries harder to change safely.",
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: "not-to-unresolvable",
      severity: "warn",
      comment: "Unresolved imports are high-signal cleanup targets for repo mapping.",
      from: {},
      to: {
        couldNotResolve: true
      }
    },
    {
      name: "no-non-package-json",
      severity: "warn",
      comment: "Imported npm packages should be declared in package.json.",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"]
      }
    },
    {
      name: "not-to-deprecated",
      severity: "warn",
      comment: "Deprecated dependencies should be replaced or isolated.",
      from: {},
      to: {
        dependencyTypes: ["deprecated"]
      }
    },
    {
      name: "no-app-to-scripts",
      severity: "error",
      comment: "Route/UI code must not depend on operational scripts.",
      from: { path: "^app/" },
      to: { path: "^scripts/" }
    },
    {
      name: "no-components-to-app",
      severity: "error",
      comment: "Reusable components must not import route/app modules.",
      from: { path: "^components/" },
      to: { path: "^app/" }
    },
    {
      name: "no-ui-to-prisma-or-db",
      severity: "error",
      comment: "Client-facing UI modules must use API/tRPC boundaries instead of direct database access.",
      from: { path: ["^components/", "^app/.*[.]tsx$"] },
      to: { path: "^(prisma/|server/db[.]ts|lib/db[.]ts)" }
    },
    {
      name: "no-server-to-ui",
      severity: "error",
      comment: "Server modules should not import app routes or reusable UI components.",
      from: { path: "^server/" },
      to: { path: "^(app|components)/" }
    },
    {
      name: "no-prisma-to-app-or-components",
      severity: "error",
      comment: "Prisma schema/migration code should stay independent from UI code.",
      from: { path: "^prisma/" },
      to: { path: "^(app|components)/" }
    },
    {
      name: "no-scripts-to-app",
      severity: "warn",
      comment: "Scripts should not depend on app route modules; extract shared logic to lib or server services.",
      from: { path: "^scripts/" },
      to: { path: "^app/" }
    }
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"]
    },
    exclude: {
      path: [
        "(^|/)node_modules/",
        "^\\.tools/",
        "^\\.planning/",
        "^\\.planning\\.backup/",
        "^\\.next",
        "^\\.tmp/",
        "^logs/",
        "^playwright-report/",
        "^test-results/",
        "^tmp/",
        "^scratch/",
        "^scripts/scratch/",
        "^scripts/_attic/",
        "^knip[.]ts$",
        "[.]tsbuildinfo$"
      ]
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json"
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      mainFields: ["module", "main", "types", "typings"]
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)"
      },
      archi: {
        collapsePattern:
          "^(?:app|components|lib|server|hooks|scripts|electron|tests|types|adapters|services|dashboard-app|prisma)/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)"
      },
      text: {
        highlightFocused: true
      }
    },
    progress: {
      type: "none"
    }
  }
};
