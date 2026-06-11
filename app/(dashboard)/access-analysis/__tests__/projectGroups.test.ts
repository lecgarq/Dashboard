import { describe, it, expect } from "vitest";
import { officeCodeFor, officeLabel, groupProjectOptions, OTHER_CODE } from "../projectGroups";
import type { ProjectOption } from "../projectFilter";

const opt = (id: string, name: string): ProjectOption => ({ id, name });

describe("officeCodeFor", () => {
  it("reads the leading city token", () => {
    expect(officeCodeFor(opt("1", "MTY AE-01"))).toBe("MTY");
    expect(officeCodeFor(opt("2", "CDMX Amazon TI'S OTLC030"))).toBe("CDMX");
    expect(officeCodeFor(opt("3", "MXL Plateros RED - OMXL170"))).toBe("MXL");
    expect(officeCodeFor(opt("4", "TIJ Stryker Eagle"))).toBe("TIJ");
  });

  it("is case-insensitive for known cities", () => {
    expect(officeCodeFor(opt("1", "Mty Vesta Apodaca TI's 06"))).toBe("MTY");
  });

  it("splits on dash and slash", () => {
    expect(officeCodeFor(opt("1", "MTY-TEC 7.1 MODEL COORD"))).toBe("MTY");
    expect(officeCodeFor(opt("2", "VDC / MONTERREY (PRUEBA-02)"))).toBe("VDC");
  });

  it("groups any other short all-caps code under that code", () => {
    expect(officeCodeFor(opt("1", "FWD SUBURBIA Tienda"))).toBe("FWD");
    expect(officeCodeFor(opt("2", "DIS Benebion X-Ray"))).toBe("DIS");
    expect(officeCodeFor(opt("3", "AF VDC Team Demo"))).toBe("AF");
  });

  it("falls back to OTHER for non-code leading tokens", () => {
    expect(officeCodeFor(opt("1", "Clash-MC"))).toBe(OTHER_CODE);
    expect(officeCodeFor(opt("2", "CLASHES (OO)"))).toBe(OTHER_CODE); // too long to be a code
    expect(officeCodeFor(opt("3", "51 D Prosperity"))).toBe(OTHER_CODE);
    expect(officeCodeFor(opt("4", "Caterpillar Santa Catarina"))).toBe(OTHER_CODE);
  });

  it("lets the MTY allowlist override a non-MTY name", () => {
    const mty = new Set(["x"]);
    expect(officeCodeFor(opt("x", "Vesta Park Canopy"), mty)).toBe("MTY");
    expect(officeCodeFor(opt("y", "Vesta Park Canopy"), mty)).toBe(OTHER_CODE);
  });
});

describe("officeLabel", () => {
  it("maps city codes to friendly names and OTHER to Other", () => {
    expect(officeLabel("MTY")).toBe("Monterrey");
    expect(officeLabel("CDMX")).toBe("Ciudad de México");
    expect(officeLabel(OTHER_CODE)).toBe("Other");
  });
  it("uses the raw code for unknown office codes", () => {
    expect(officeLabel("FWD")).toBe("FWD");
  });
});

describe("groupProjectOptions", () => {
  const options = [
    opt("a", "Caterpillar Santa Catarina"), // OTHER
    opt("b", "CDMX Amazon"), // CDMX
    opt("c", "MTY AE-01"), // MTY
    opt("d", "FWD Navistar"), // FWD
    opt("e", "MTY Danfoss"), // MTY
    opt("f", "Clash-MC"), // OTHER
    opt("g", "DIS Aptiv"), // FWD-tier code group, smaller than FWD? equal size
  ];

  it("orders cities first (curated), then other codes by size, OTHER last", () => {
    const groups = groupProjectOptions(options);
    expect(groups.map((g) => g.code)).toEqual(["MTY", "CDMX", "DIS", "FWD", OTHER_CODE]);
    // DIS vs FWD both size 1 -> alphabetical by label
  });

  it("sorts members within a group by name", () => {
    const groups = groupProjectOptions(options);
    const mty = groups.find((g) => g.code === "MTY")!;
    expect(mty.options.map((o) => o.name)).toEqual(["MTY AE-01", "MTY Danfoss"]);
  });

  it("honors the allowlist override when grouping", () => {
    const groups = groupProjectOptions(options, new Set(["a"])); // Caterpillar -> MTY
    const mty = groups.find((g) => g.code === "MTY")!;
    expect(mty.options.map((o) => o.id).sort()).toEqual(["a", "c", "e"]);
  });

  it("returns a single group when everything is ungrouped", () => {
    const groups = groupProjectOptions([opt("1", "Tower A"), opt("2", "Tower B")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].code).toBe(OTHER_CODE);
  });
});
