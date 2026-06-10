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
  project: ['**/*.{js,ts,tsx}'],
  ignore: [
    'components/ui/**',        // Shadcn UI components are imported ad-hoc
    'scripts/**',              // Utility/cron scripts run via node, not imported by the app
    'playwright.verify.config.ts', // invoked via `playwright test --config` by the /verify flow, not imported
    'lib/acc/apsAuth.ts',          // required at runtime by scripts/acc-issues-*.cjs (scripts/ is knip-blind)
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
  ],
  ignoreBinaries: ['python'], // npm run dev drives scripts/run_dev_stack.py
};

export default config;
