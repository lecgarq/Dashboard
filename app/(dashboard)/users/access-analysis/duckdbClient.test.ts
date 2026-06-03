import { describe, expect, it } from "vitest";
import { canInitializeDuckDbInBrowser, getDuckDbClient, resetDuckDbClientForTests } from "./duckdbClient";

describe("duckdbClient", () => {
  it("does not initialize DuckDB-Wasm during SSR or node tests", async () => {
    resetDuckDbClientForTests();

    expect(canInitializeDuckDbInBrowser()).toBe(false);
    await expect(getDuckDbClient()).rejects.toThrow("browser runtime");
  });
});
