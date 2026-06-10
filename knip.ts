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
  ],
  ignoreDependencies: [
    'shadcn',
    'eslint-config-next',
    '@types/bcryptjs',
    '@auth/core',
    'tw-animate-css', // imported via @import in app/globals.css — invisible to knip
  ],
};

export default config;
