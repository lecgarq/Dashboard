import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

import { createClientLogger } from "@/lib/core/logger";

type YjsProviderEntry = {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  refCount: number;
  authToken: string;
};

const yjsCache = new Map<string, YjsProviderEntry>();
const wikiLogger = createClientLogger("WikiEditor");

function getYjsWsUrl() {
  const envUrl = process.env.NEXT_PUBLIC_YJS_WS_URL;
  const isBrowser = typeof window !== "undefined";
  const isSecure = isBrowser && window.location.protocol === "https:";
  const defaultFallback = "wss://prolific-flow-production.up.railway.app";

  // 1. Use the production fallback if no environment variable is defined
  if (!envUrl) {
    return defaultFallback;
  }

  // 2. Detect "Private IP" configurations in a "Public" (HTTPS) environment.
  // Browsers block mixed content (ws:// on https://) and private IPs are unreachable from the web.
  const isPrivateIp = /ws:\/\/192\.168\.|ws:\/\/10\.|ws:\/\/172\./.test(envUrl);
  if (isSecure && isPrivateIp) {
    wikiLogger.warn(
      `Redirecting: WebSocket IP "${envUrl}" is unreachable from public HTTPS. Using fallback: ${defaultFallback}`
    );
    return defaultFallback;
  }

  // 3. Automatically upgrade ws:// to wss:// if on an HTTPS site (unless it's localhost)
  if (isSecure && envUrl.startsWith("ws://") && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return `wss://${envUrl.slice(5)}`;
  }

  return envUrl;
}

export function getOrCreateYjsProvider(roomName: string, authToken: string) {
  let cached = yjsCache.get(roomName);
  if (cached && cached.authToken !== authToken) {
    cached.provider.destroy();
    cached.ydoc.destroy();
    yjsCache.delete(roomName);
    cached = undefined;
  }

  if (!cached) {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(getYjsWsUrl(), roomName, ydoc, {
      connect: false,
      params: { token: authToken },
      maxBackoffTime: 10000,
    });

    try {
      provider.connect();
    } catch {
      wikiLogger.warn(`Failed to connect WebSocket for room "${roomName}"`);
    }

    cached = {
      ydoc,
      provider,
      refCount: 0,
      authToken,
    };
    yjsCache.set(roomName, cached);
  }

  return cached;
}

export function releaseYjsProvider(roomName: string, cached: YjsProviderEntry) {
  cached.refCount -= 1;
  if (cached.refCount > 0) return;

  setTimeout(() => {
    if (cached.refCount > 0) return;
    // Guard: a new provider may have been created for the same room before
    // this timer fired. Only destroy/delete the exact entry we released.
    if (yjsCache.get(roomName) !== cached) return;
    cached.provider.destroy();
    cached.ydoc.destroy();
    yjsCache.delete(roomName);
  }, 100);
}
