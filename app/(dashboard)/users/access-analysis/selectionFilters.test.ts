import { describe, expect, it, vi } from "vitest";
import { describeActiveFilters, clearAllFilters, type SelectionLike } from "./selectionFilters";

function fakeSelection(clauses: Array<{ source: unknown; predicate: unknown }>): SelectionLike {
  return {
    clauses,
    update: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SelectionLike;
}

describe("selectionFilters", () => {
  it("describes active clauses with a label and source", () => {
    const sel = fakeSelection([
      { source: "users:project_count", predicate: { toString: () => '"project_count" BETWEEN 4 AND 10' } },
    ]);
    const result = describeActiveFilters([{ selection: sel, scope: "Users" }]);
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("Users");
    expect(result[0].label).toContain("project_count");
  });

  it("ignores clauses with an empty predicate", () => {
    const sel = fakeSelection([{ source: "users:x", predicate: null }]);
    expect(describeActiveFilters([{ selection: sel, scope: "Users" }])).toHaveLength(0);
  });

  it("clears each active clause by re-issuing a null predicate for its source", () => {
    const clause = { source: "users:project_count", predicate: { toString: () => "x" } };
    const sel = fakeSelection([clause]);
    clearAllFilters([{ selection: sel, scope: "Users" }]);
    expect(sel.update).toHaveBeenCalledWith({ source: clause.source, predicate: null, value: null });
  });
});
