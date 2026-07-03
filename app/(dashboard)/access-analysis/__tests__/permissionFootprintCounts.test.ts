import { describe, expect, it } from "vitest";
import { formatBytes } from "../permissionFootprintCounts";

describe("formatBytes", () => {
  it("renders '0 B' for non-finite or non-positive values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });

  it("renders bytes with no decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("renders KB/MB/GB/TB with 1 decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(42.3 * 1024 ** 3)).toBe("42.3 GB");
    expect(formatBytes(2.96 * 1024 ** 4)).toBe("3.0 TB");
  });
});
