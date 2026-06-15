import { describe, it, expect } from "vitest";
import {
  buildFolderIndex,
  resolveEffectiveTier,
  applyToSubtree,
  countExplicit,
  type FormaFolder,
} from "./inheritance";

// tree:  root → a → a1, a2 ;  root → b
const FOLDERS: FormaFolder[] = [
  { id: "root", parentId: null, name: "Project Files", fullPath: "/Project Files" },
  { id: "a", parentId: "root", name: "A", fullPath: "/Project Files/A" },
  { id: "a1", parentId: "a", name: "A1", fullPath: "/Project Files/A/A1" },
  { id: "a2", parentId: "a", name: "A2", fullPath: "/Project Files/A/A2" },
  { id: "b", parentId: "root", name: "B", fullPath: "/Project Files/B" },
];

describe("inheritance", () => {
  it("default (no explicit) resolves to No access, not inherited", () => {
    const { byId } = buildFolderIndex(FOLDERS);
    expect(resolveEffectiveTier("a1", {}, byId)).toEqual({
      tier: "No access", inherited: false, sourceId: null,
    });
  });

  it("a child inherits the nearest ancestor's explicit tier", () => {
    const { byId } = buildFolderIndex(FOLDERS);
    const explicit = { a: "View+Download" as const };
    expect(resolveEffectiveTier("a1", explicit, byId)).toEqual({
      tier: "View+Download", inherited: true, sourceId: "a",
    });
  });

  it("an explicit value on the folder itself wins and is not inherited", () => {
    const { byId } = buildFolderIndex(FOLDERS);
    const explicit = { a: "View+Download" as const, a1: "No access" as const };
    expect(resolveEffectiveTier("a1", explicit, byId)).toEqual({
      tier: "No access", inherited: false, sourceId: "a1",
    });
  });

  it("applyToSubtree stamps the folder and every descendant explicitly", () => {
    const index = buildFolderIndex(FOLDERS);
    const next = applyToSubtree("a", "Full Controller", {}, index);
    expect(next).toEqual({ a: "Full Controller", a1: "Full Controller", a2: "Full Controller" });
    // does not touch siblings/root
    expect(next.b).toBeUndefined();
    expect(next.root).toBeUndefined();
  });

  it("applyToSubtree returns a new object (no mutation)", () => {
    const index = buildFolderIndex(FOLDERS);
    const prev = { b: "View Only" as const };
    const next = applyToSubtree("a", "Full Controller", prev, index);
    expect(prev).toEqual({ b: "View Only" }); // unchanged
    expect(next.b).toBe("View Only"); // preserved
    expect(next.a).toBe("Full Controller");
  });

  it("countExplicit counts set folders", () => {
    expect(countExplicit({ a: "View Only", b: "No access" })).toBe(2);
    expect(countExplicit({})).toBe(0);
  });
});
