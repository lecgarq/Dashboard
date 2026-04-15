import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['app/**/page.tsx', 'app/**/layout.tsx', 'app/api/**/route.ts', 'server/routers/**/*.ts'],
  project: ['**/*.{js,ts,tsx}'],
  ignore: [
    'components/ui/**',        // Ignore Shadcn UI components as they are typically imported ad-hoc
    '.gsd/**',                 // Ignore GSD documentation
    'scripts/**',              // Ignore utility scripts not directly running in prod
    'node_modules/**',         // Implicitly ignored but good to be explicit
    'next-env.d.ts',
    'postcss.config.mjs'
  ],
  ignoreDependencies: [
    'shadcn', 
    'eslint-config-next',
    '@types/react',
    '@types/react-dom',
    '@tailwindcss/postcss',
    'tw-animate-css',
    '@auth/core',
    '@auth/core/adapters',
    'react',
    'react-dom',
    '@types/bcryptjs',
    'next-themes'
  ]
};

export default config;
