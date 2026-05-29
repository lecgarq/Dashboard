/**
 * catalogSearch.ts — Filter catalog sections (structural / activity tree / folder) by a
 * case-insensitive substring query over labels. A match on a module/group label keeps that
 * whole branch; otherwise only matching actions are kept and empty groups/modules are pruned.
 * Pure: no React/DOM/IO.
 */
import type { CatalogSection } from "./dimensionCatalog";

const hit = (label: string, q: string) => label.toLowerCase().includes(q);

export function filterSections(sections: readonly CatalogSection[], query: string): CatalogSection[] {
  const q = query.trim().toLowerCase();
  if (q === "") return sections.map((s) => ({ ...s }));
  return sections.map((s) => {
    if (s.kind === "activity") {
      const modules = (s.modules ?? [])
        .map((m) => {
          const moduleHit = hit(m.moduleLabel, q);
          const groups = m.groups
            .map((g) => {
              const groupHit = moduleHit || hit(g.groupLabel, q);
              const actions = groupHit ? g.actions : g.actions.filter((a) => hit(a.label, q));
              return { ...g, actions };
            })
            .filter((g) => g.actions.length > 0);
          return { ...m, groups };
        })
        .filter((m) => m.groups.length > 0);
      return { ...s, modules };
    }
    const dims = (s.dims ?? []).filter((x) => hit(x.label, q));
    return { ...s, dims };
  });
}
