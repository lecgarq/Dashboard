import path from "node:path";
import type { NextConfig } from "next";
import {
  getConfiguredAuthHosts,
  getConfiguredAuthHostnames,
} from "./lib/auth-env";

const allowedServerActionOrigins = Array.from(
  new Set([
    "localhost:3000",
    "127.0.0.1:3000",
    ...getConfiguredAuthHosts(),
  ])
);

const allowedDevOrigins = Array.from(
  new Set([
    "localhost",
    "127.0.0.1",
    ...getConfiguredAuthHostnames(),
  ])
);

const emptyDuckDbNodeModule = path.resolve(process.cwd(), "lib/client/emptyDuckDbNode.ts");
const duckDbBrowserModule = path.resolve(process.cwd(), "node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs");

const nextConfig: NextConfig = {
  // Allow an isolated build dir (e.g. the e2e dev server uses .next-e2e) so it
  // never clobbers the .next that a concurrently running prod server reads.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "uploadthing.com" },
      { protocol: "https", hostname: "utfs.io" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  compiler: {
    // Remove console.log in production for smaller bundles
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@duckdb/duckdb-wasm$": duckDbBrowserModule,
      "@duckdb/duckdb-wasm/dist/duckdb-node": emptyDuckDbNodeModule,
      "@duckdb/duckdb-wasm/dist/duckdb-node.cjs": emptyDuckDbNodeModule,
    };

    if (!isServer) {
      // Give tunnel proxy more time to serve chunks before ChunkLoadError
      config.output.chunkLoadTimeout = 60000;
      // Prevent server-only packages from being bundled for the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        http: false,
        https: false,
        path: false,
        stream: false,
        crypto: false,
        os: false,
        zlib: false,
      };
    }
    return config;
  },
  serverExternalPackages: ["googleapis", "@google-cloud/local-auth", "google-auth-library"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "framer-motion",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/core",
    ],
    serverActions: {
      allowedOrigins: allowedServerActionOrigins,
    },
    optimisticClientCache: true,
  },
};

export default nextConfig;
