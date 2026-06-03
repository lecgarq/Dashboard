// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDuckDbClient, resetDuckDbClientForTests } from "./duckdbClient";

const duckdbMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  createObjectUrl: vi.fn(),
  instantiate: vi.fn(),
  revokeObjectUrl: vi.fn(),
  selectBundle: vi.fn(),
  terminate: vi.fn(),
  workerUrl: "",
}));

vi.mock("@duckdb/duckdb-wasm/dist/duckdb-browser.mjs", () => ({
  selectBundle: duckdbMocks.selectBundle,
  ConsoleLogger: vi.fn(function ConsoleLogger() {}),
  AsyncDuckDB: vi.fn(function AsyncDuckDB(this: {
    connect: typeof duckdbMocks.connect;
    instantiate: typeof duckdbMocks.instantiate;
    terminate: typeof duckdbMocks.terminate;
  }) {
    this.connect = duckdbMocks.connect;
    this.instantiate = duckdbMocks.instantiate;
    this.terminate = duckdbMocks.terminate;
  }),
}));

class MockWorker {
  constructor(url: string) {
    duckdbMocks.workerUrl = url;
  }
}

describe("duckdbClient browser URL handling", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    resetDuckDbClientForTests();
    duckdbMocks.workerUrl = "";
    duckdbMocks.instantiate.mockReset().mockResolvedValue(undefined);
    duckdbMocks.connect.mockReset().mockResolvedValue({ close: vi.fn() });
    duckdbMocks.terminate.mockReset().mockResolvedValue(undefined);
    duckdbMocks.createObjectUrl.mockReset().mockReturnValue("blob:duckdb-worker");
    duckdbMocks.revokeObjectUrl.mockReset();
    duckdbMocks.selectBundle.mockReset().mockResolvedValue({
      mainModule: "/duckdb-wasm/duckdb-eh.wasm",
      mainWorker: "/duckdb-wasm/duckdb-browser-eh.worker.js",
      pthreadWorker: "/duckdb-wasm/duckdb-browser-eh.pthread.worker.js",
    });

    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: duckdbMocks.createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: duckdbMocks.revokeObjectUrl,
    });
  });

  afterEach(() => {
    resetDuckDbClientForTests();
    vi.unstubAllGlobals();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("passes absolute wasm and worker URLs into DuckDB-Wasm", async () => {
    await getDuckDbClient();

    expect(duckdbMocks.instantiate).toHaveBeenCalledWith(
      new URL("/duckdb-wasm/duckdb-eh.wasm", window.location.origin).toString(),
      new URL("/duckdb-wasm/duckdb-browser-eh.pthread.worker.js", window.location.origin).toString(),
    );
    expect(duckdbMocks.createObjectUrl.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(duckdbMocks.workerUrl).toBe("blob:duckdb-worker");
  });
});
