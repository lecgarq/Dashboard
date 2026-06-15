import { describe, it, expect } from "vitest";
import {
  HIERARCHY_ROOT, normalizeHierarchy, isDescendant, canReparent, reparent,
  toOrgInput, coverageByRole, type HierarchyMap,
} from "./hierarchy";

const ROLES = ["a", "b", "c", "d"];

describe("normalizeHierarchy", () => {
  it("fills missing roles, drops unknowns, nulls self/unknown parents", () => {
    const map: HierarchyMap = { a: "b", b: null, c: "zzz", d: "d", x: "a" };
    const out = normalizeHierarchy(map, ROLES);
    expect(out).toEqual({ a: "b", b: null, c: null, d: null });
    expect("x" in out).toBe(false);
  });

  it("breaks cycles by detaching the closing node", () => {
    const map: HierarchyMap = { a: "b", b: "a", c: null, d: null };
    const out = normalizeHierarchy(map, ROLES);
    // exactly one of a/b is detached so the result is acyclic
    const reachesRoot = (id: string) => {
      const seen = new Set<string>([id]);
      let cur = out[id];
      while (cur !== null) {
        if (seen.has(cur)) return false;
        seen.add(cur);
        cur = out[cur] ?? null;
      }
      return true;
    };
    expect(ROLES.every(reachesRoot)).toBe(true);
  });
});

describe("isDescendant / canReparent", () => {
  // a → b → c  (c under b under a)
  const map: HierarchyMap = { a: null, b: "a", c: "b", d: null };

  it("isDescendant walks the parent chain", () => {
    expect(isDescendant("c", "a", map)).toBe(true);
    expect(isDescendant("b", "a", map)).toBe(true);
    expect(isDescendant("a", "c", map)).toBe(false);
    expect(isDescendant("d", "a", map)).toBe(false);
  });

  it("canReparent forbids self, descendants; allows null and unrelated", () => {
    expect(canReparent("a", null, map)).toBe(true);
    expect(canReparent("a", "a", map)).toBe(false); // self
    expect(canReparent("a", "c", map)).toBe(false); // c is a descendant of a
    expect(canReparent("d", "a", map)).toBe(true); // unrelated
  });
});

describe("reparent", () => {
  const map: HierarchyMap = { a: null, b: "a", c: "b", d: null };

  it("applies a valid move immutably", () => {
    const next = reparent(map, "d", "a");
    expect(next.d).toBe("a");
    expect(map.d).toBe(null); // original untouched
  });

  it("ignores an invalid (cycle) move", () => {
    const next = reparent(map, "a", "c");
    expect(next).toBe(map); // same reference, no change
  });
});

describe("toOrgInput", () => {
  it("emits one synthetic root and every role pointing to parent or root", () => {
    const map: HierarchyMap = { a: null, b: "a", c: null, d: null };
    const input = toOrgInput(ROLES, map);
    const roots = input.filter((n) => n.parentId === null);
    expect(roots).toEqual([{ id: HIERARCHY_ROOT, parentId: null }]);
    expect(input.find((n) => n.id === "b")?.parentId).toBe("a");
    expect(input.find((n) => n.id === "a")?.parentId).toBe(HIERARCHY_ROOT);
    expect(input).toHaveLength(ROLES.length + 1);
  });
});

describe("coverageByRole", () => {
  it("counts explicit folders per role", () => {
    const cov = coverageByRole({ a: { f1: "x", f2: "y" }, c: { f1: "x" } }, ROLES);
    expect(cov).toEqual({ a: 2, b: 0, c: 1, d: 0 });
  });
});
