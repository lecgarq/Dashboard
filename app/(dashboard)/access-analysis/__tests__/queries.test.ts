import { describe, it, expect } from "vitest";
import { accessKeys } from "../queries";
import { EMPTY_FILTERS } from "../types";

describe("accessKeys", () => {
  it("namespaces and includes the filter set so queries re-key on change", () => {
    const a = accessKeys.summary(EMPTY_FILTERS);
    const b = accessKeys.summary({ ...EMPTY_FILTERS, module: ["build"] });
    expect(a[0]).toBe("access-analysis");
    expect(a).not.toEqual(b);
  });
});
