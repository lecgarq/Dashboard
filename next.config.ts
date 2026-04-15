import type { NextConfig } from "next";

type ParsedOrigin = {
  host: string;
  hostname: string;
};

function parseConfiguredOrigin(value: string): ParsedOrigin | null {
  try {
    const parsed = new URL(value);
    return {
      host: parsed.host.toLowerCase(),
      hostname: parsed.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

const configuredAuthOrigins = [process.env.NEXTAUTH_URL, process.env.AUTH_URL]
  .filter((value): value is string => Boolean(value))
  .map(parseConfiguredOrigin)
  .filter((value): value is ParsedOrigin => Boolean(value));

const allowedServerActionOrigins = Array.from(
  new Set([
    "localhost:3000",
    "127.0.0.1:3000",
    ...configuredAuthOrigins.map((origin) => origin.host),
  ])
);

const allowedDevOrigins = Array.from(
  new Set([
    "localhost",
    "127.0.0.1",
    ...configuredAuthOrigins.map((origin) => origin.hostname),
  ])
);

const nextConfig: NextConfig = {
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
