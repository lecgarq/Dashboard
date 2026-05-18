import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface BrowserDuckDbClient {
  db: AsyncDuckDB;
  connection: AsyncDuckDBConnection;
  terminate: () => Promise<void>;
}

let cachedClient: Promise<BrowserDuckDbClient> | null = null;

export function canInitializeDuckDbInBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined" && typeof Worker !== "undefined";
}

export async function getDuckDbClient(): Promise<BrowserDuckDbClient> {
  if (!canInitializeDuckDbInBrowser()) {
    throw new Error("DuckDB-Wasm analytics can only initialize in a browser runtime.");
  }
  if (cachedClient) return cachedClient;

  cachedClient = (async () => {
    const duckdb = await import("@duckdb/duckdb-wasm/dist/duckdb-browser.mjs");
    // Self-hosted from /public/duckdb-wasm (populated by `postinstall`). The
    // jsdelivr CDN bundles add ~5MB of gzipped cross-origin download to the
    // first click — see DeferredAnalyticsSection.
    const SELF_HOSTED_BUNDLES = {
      mvp: {
        mainModule: "/duckdb-wasm/duckdb-mvp.wasm",
        mainWorker: "/duckdb-wasm/duckdb-browser-mvp.worker.js",
      },
      eh: {
        mainModule: "/duckdb-wasm/duckdb-eh.wasm",
        mainWorker: "/duckdb-wasm/duckdb-browser-eh.worker.js",
      },
    } as const;
    const bundle = await duckdb.selectBundle(SELF_HOSTED_BUNDLES);
    const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const connection = await db.connect();
    return {
      db,
      connection,
      terminate: async () => {
        await connection.close();
        await db.terminate();
        URL.revokeObjectURL(workerUrl);
        cachedClient = null;
      },
    };
  })();

  return cachedClient;
}

export function resetDuckDbClientForTests(): void {
  cachedClient = null;
}

