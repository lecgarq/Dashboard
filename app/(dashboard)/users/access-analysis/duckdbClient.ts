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

function toAbsoluteBundleUrl(url: string | undefined): string | undefined {
  return url ? new URL(url, window.location.origin).toString() : undefined;
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
    // bundle.mainWorker is a root-relative path like "/duckdb-wasm/...". Inside
    // the worker's blob:-scoped global, importScripts() cannot resolve a relative
    // URL — it must be absolute. Anchor it to the current page origin.
    const absoluteMainModuleUrl = toAbsoluteBundleUrl(bundle.mainModule);
    const absoluteWorkerUrl = toAbsoluteBundleUrl(bundle.mainWorker);
    const absolutePthreadWorkerUrl = toAbsoluteBundleUrl(bundle.pthreadWorker);
    if (!absoluteMainModuleUrl || !absoluteWorkerUrl) {
      throw new Error("DuckDB-Wasm bundle is missing required module or worker URLs.");
    }
    const workerUrl = URL.createObjectURL(new Blob([`importScripts("${absoluteWorkerUrl}");`], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(absoluteMainModuleUrl, absolutePthreadWorkerUrl);
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
