export const DEFAULT_WIKI_SECTIONS = [
  { section: "inputs", title: "Inputs", order: 0 },
  { section: "naming", title: "Naming Conventions", order: 1 },
  { section: "responsibilities", title: "Responsibilities", order: 2 },
  { section: "qa-gates", title: "QA Gates", order: 3 },
  { section: "acc-placement", title: "ACC Placement", order: 4 },
  { section: "definition-of-done", title: "Definition of Done", order: 5 },
] as const;

export const DEFAULT_WIKI_SECTION_KEY_SET = new Set(
  DEFAULT_WIKI_SECTIONS.map((section) => section.section)
);

export function normalizeWikiSectionKey(section: string): string {
  if (!section) return section;

  const parts = section.split("-");
  if (parts.length > 1 && parts[0].length > 10) {
    return parts.slice(1).join("-");
  }

  return section;
}
