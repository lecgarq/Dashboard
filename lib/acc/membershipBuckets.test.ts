import { describe, expect, it } from "vitest";
import {
  NO_MODULE_ACCESS,
  PROJECT_ADMIN,
  PROJECT_MEMBER,
  accessBucketLabel,
} from "./accessBucket";
import { NOT_A_FILE, fileExtensionLabel, fileExtensionOf } from "./fileExtension";
import { MULTIPLE_ROLES, REMOVED_MEMBER, UNKNOWN_ROLE, roleBucketLabel } from "./roleCounts";

describe("roleBucketLabel (shared by the donut and the activity universe)", () => {
  it("checks the deleted lifecycle BEFORE the role gap", () => {
    // Deleted rows never carry roles, so order is what keeps the two apart.
    expect(roleBucketLabel({ roles: [], status: "deleted" })).toBe(REMOVED_MEMBER);
    expect(roleBucketLabel({ roles: ["Architect"], status: "deleted" })).toBe(REMOVED_MEMBER);
    expect(roleBucketLabel({ roles: [], status: "active" })).toBe(UNKNOWN_ROLE);
  });

  it("collapses multi-role seats into one bucket, deduping repeats first", () => {
    expect(roleBucketLabel({ roles: ["Architect"], status: "active" })).toBe("Architect");
    expect(roleBucketLabel({ roles: ["Architect", "Architect"] })).toBe("Architect");
    expect(roleBucketLabel({ roles: ["Architect", "Owner"] })).toBe(MULTIPLE_ROLES);
  });
});

describe("accessBucketLabel", () => {
  it("separates the seats that open nothing from real members", () => {
    expect(accessBucketLabel({ modules: ["build"], adminModules: ["build"] })).toBe(PROJECT_ADMIN);
    expect(accessBucketLabel({ modules: ["build"], adminModules: [] })).toBe(PROJECT_MEMBER);
    expect(accessBucketLabel({ modules: [], adminModules: [] })).toBe(NO_MODULE_ACCESS);
  });

  it("admin wins even when it is one module out of many", () => {
    expect(
      accessBucketLabel({ modules: ["docs", "build", "insight"], adminModules: ["insight"] }),
    ).toBe(PROJECT_ADMIN);
  });
});

describe("fileExtensionOf", () => {
  it("reads the real extension off ACC filenames", () => {
    expect(fileExtensionOf("PLANO ESTRUCTURAL.pdf")).toBe("pdf");
    expect(fileExtensionOf("MODELO.RVT")).toBe("rvt");
    expect(fileExtensionOf(" spaced.dwg ")).toBe("dwg");
    // Dotted revision codes are everywhere in this corpus — take the tail only.
    expect(fileExtensionOf("PLANO-A.01.2024.dwg")).toBe("dwg");
  });

  it("returns null rather than inventing a format", () => {
    expect(fileExtensionOf(null)).toBeNull();
    expect(fileExtensionOf(undefined)).toBeNull();
    expect(fileExtensionOf("")).toBeNull();
    expect(fileExtensionOf("README")).toBeNull();
    // Past the 6-char bound = a dotted name fragment, not an extension.
    expect(fileExtensionOf("REPORTE.septiembre")).toBeNull();
  });

  it("rejects numeric revision/date tails (233 junk categories in a real build)", () => {
    expect(fileExtensionOf("PLANO-A.01.2024")).toBeNull();
    expect(fileExtensionOf("MEMORIA.REV.3")).toBeNull();
    expect(fileExtensionOf("ESTRUCTURA.15")).toBeNull();
    // …while keeping the digit-leading formats that are real.
    expect(fileExtensionOf("terreno.3ds")).toBe("3ds");
    expect(fileExtensionOf("paquete.7z")).toBe("7z");
    // A revision code BEFORE a real extension still resolves to the extension.
    expect(fileExtensionOf("PLANO-A.01.2024.dwg")).toBe("dwg");
  });

  it("labels formats as format names", () => {
    expect(fileExtensionLabel("pdf")).toBe("PDF");
    expect(fileExtensionLabel("dsmesh")).toBe("DSMESH");
    expect(NOT_A_FILE).toBe("Not a file");
  });
});
