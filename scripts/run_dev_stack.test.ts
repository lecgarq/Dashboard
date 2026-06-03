import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("run_dev_stack ACC prewarm support", () => {
  it("supports the --prewarm-acc flag, ACC_PREWARM env, and the dev prewarm endpoint", () => {
    const source = readFileSync("scripts/run_dev_stack.py", "utf8");

    expect(source).toContain("--prewarm-acc");
    expect(source).toContain("ACC_PREWARM");
    expect(source).toContain("/api/dev/prewarm-acc");
  });
});
