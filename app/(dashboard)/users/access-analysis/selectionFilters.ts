// selectionFilters.ts
// Pure helpers for reading + clearing Mosaic crossfilter selections, kept
// free of React so they are unit-testable with a fake selection. The runtime
// Mosaic Selection satisfies SelectionLike structurally.

export interface ClauseLike {
  source: unknown;
  predicate: { toString(): string } | null | undefined;
}

export interface SelectionLike {
  clauses: ClauseLike[];
  update(clause: { source: unknown; predicate: null; value: null }): void;
  addEventListener(type: "value", cb: () => void): void;
  removeEventListener(type: "value", cb: () => void): void;
}

export interface ScopedSelection {
  selection: SelectionLike;
  scope: string;
}

export interface ActiveFilter {
  key: string;
  scope: string;
  label: string;
  source: unknown;
  selection: SelectionLike;
}

function predicateText(clause: ClauseLike): string {
  const p = clause.predicate;
  if (p === null || p === undefined) return "";
  return String(p).trim();
}

export function describeActiveFilters(scoped: ScopedSelection[]): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const { selection, scope } of scoped) {
    for (const clause of selection.clauses ?? []) {
      const label = predicateText(clause);
      if (!label) continue;
      out.push({
        key: `${scope}:${String(clause.source)}`,
        scope,
        label,
        source: clause.source,
        selection,
      });
    }
  }
  return out;
}

export function clearFilter(filter: ActiveFilter): void {
  filter.selection.update({ source: filter.source, predicate: null, value: null });
}

export function clearAllFilters(scoped: ScopedSelection[]): void {
  for (const filter of describeActiveFilters(scoped)) {
    clearFilter(filter);
  }
}
