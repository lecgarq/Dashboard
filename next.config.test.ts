import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next webpack config", () => {
  it("aliases DuckDB's Node bundle away from browser Mosaic imports", () => {
    const webpack = nextConfig.webpack;
    expect(typeof webpack).toBe("function");

    const config = webpack!(
      { resolve: { alias: {}, fallback: {} }, output: {}, plugins: [] },
      { isServer: false } as Parameters<NonNullable<typeof webpack>>[1],
    );

    expect(config.resolve?.alias).toMatchObject({
      "@duckdb/duckdb-wasm$": expect.stringContaining("duckdb-browser.mjs"),
      "@duckdb/duckdb-wasm/dist/duckdb-node.cjs": expect.stringContaining("emptyDuckDbNode"),
      "@duckdb/duckdb-wasm/dist/duckdb-node": expect.stringContaining("emptyDuckDbNode"),
    });
  });
});
