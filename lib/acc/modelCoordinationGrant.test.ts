import { describe, expect, it } from "vitest";

import {
  mergeModelCoordinationProduct,
  normalizeModelCoordinationAccess,
  summarizeGrantResults,
} from "./modelCoordinationGrant";

describe("mergeModelCoordinationProduct", () => {
  it("adds modelCoordination access without changing other products", () => {
    const products = [{ key: "docs", access: "member" }];

    expect(mergeModelCoordinationProduct(products, "member")).toEqual([
      { key: "docs", access: "member" },
      { key: "modelCoordination", access: "member" },
    ]);
  });

  it("updates existing modelCoordination access", () => {
    const products = [
      { key: "docs", access: "member" },
      { key: "modelCoordination", access: "none" },
    ];

    expect(mergeModelCoordinationProduct(products, "administrator")).toEqual([
      { key: "docs", access: "member" },
      { key: "modelCoordination", access: "administrator" },
    ]);
  });

  it("keeps projectAdministration administrator payload internally consistent", () => {
    const products = [
      { key: "projectAdministration", access: "administrator" },
      { key: "docs", access: "member" },
      { key: "modelCoordination", access: "none" },
    ];

    expect(mergeModelCoordinationProduct(products, "member")).toEqual([
      { key: "projectAdministration", access: "administrator" },
      { key: "docs", access: "administrator" },
      { key: "modelCoordination", access: "administrator" },
    ]);
  });
});

describe("normalizeModelCoordinationAccess", () => {
  it("accepts Autodesk product access values", () => {
    expect(normalizeModelCoordinationAccess("administrator")).toBe("administrator");
    expect(normalizeModelCoordinationAccess("member")).toBe("member");
    expect(normalizeModelCoordinationAccess("none")).toBe("none");
  });

  it("rejects unknown access values", () => {
    expect(() => normalizeModelCoordinationAccess("admin")).toThrow(/Expected one of/);
  });
});

describe("summarizeGrantResults", () => {
  it("counts each grant outcome", () => {
    expect(summarizeGrantResults([
      { status: "updated" },
      { status: "added" },
      { status: "already" },
      { status: "failed" },
      { status: "skipped" },
    ])).toEqual({
      updated: 1,
      added: 1,
      already: 1,
      failed: 1,
      skipped: 1,
    });
  });
});
