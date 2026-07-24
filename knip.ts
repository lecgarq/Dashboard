import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'app/**/page.tsx',
    'app/**/layout.tsx',
    'app/**/loading.tsx',
    'app/**/error.tsx',
    'app/api/**/route.ts',
    'server/routers/**/*.ts',
    'auth.config.ts',
    'electron/**/*.{js,cjs,mjs}',
  ],
  project: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'server/**/*.{ts,tsx}',
    'electron/**/*.{js,cjs,mjs}',
    '*.{js,cjs,mjs,ts,tsx}',
  ],
  ignore: [
    'components/ui/**',        // Ignore Shadcn UI components as they are typically imported ad-hoc
    'scripts/**',              // Ignore utility scripts not directly running in prod
    'playwright.verify.config.ts', // invoked via `playwright test --config` by the /verify flow, not imported
    'lib/acc/apsAuth.ts',          // required at runtime by scripts/acc-issues-*.cjs (scripts/ is knip-blind)
    'lib/acc/accdsToken.ts',       // runtime API imported by scripts/accds-activity-ingest.cjs
    'lib/acc/dcProgressiveBackfill.ts', // exports consumed by scripts/progress-monitor.cjs
    'lib/acc/folderCrawl.ts',      // recovery API loaded by scripts/folder-perms-recover.cjs
    'lib/acc/ingestActivityZip.ts', // required at runtime by scripts/dc-extract-id-list.cjs
    'lib/client/emptyDuckDbNode.ts', // webpack alias target in next.config.ts (string path, not an import)
  ],
  ignoreDependencies: [
    'shadcn',
    'eslint-config-next',
    '@types/bcryptjs',
    '@auth/core',
    'tw-animate-css', // imported via @import in app/globals.css — invisible to knip
    'pdfjs-dist',     // worker file imported via react-pdf's transitive copy (version must follow react-pdf)
    'unzipper',       // used by lib/acc/ingestActivityZip.ts + scripts (both knip-ignored)
    '@ast-grep/cli',  // invoked by scripts/repo-map/generate.cjs through its local binary
    'repomix',        // invoked by scripts/repo-map/generate.cjs through its local binary
  ],
  ignoreBinaries: ['python'], // npm run dev drives scripts/run_dev_stack.py
};

export default config;
