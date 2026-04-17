import { normalizeWikiSectionKey } from "@/lib/wiki/sections";

export type ModuleWikiSection = {
  id: string;
  projectId: string;
  section: string;
  title: string;
  content: string;
  yjsState?: Uint8Array | Buffer | null;
  status: string;
  order: number;
  updatedAt: Date;
};

export type ModuleStreamEvent =
  | {
      type: "wiki-upsert";
      projectId: string;
      wiki: {
        id: string;
        section: string;
        title: string;
        content: string;
        status: string;
        order: number;
        updatedAt: string;
      };
    }
  | {
      type: "wiki-status";
      projectId: string;
      wiki: {
        id: string;
        section: string;
        status: string;
        updatedAt: string;
      };
    }
  | {
      type: "wiki-deleted";
      projectId: string;
      section: string;
    }
  | {
      type: "wiki-list-reordered";
      projectId: string;
    };

export function buildWikiSectionSlug(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, "-");
}

export function findModuleSectionIndex<T extends { section: string }>(
  sections: T[],
  incomingSection: string
) {
  const directMatch = sections.findIndex((item) => item.section === incomingSection);
  if (directMatch !== -1) return directMatch;

  const incomingKey = normalizeWikiSectionKey(incomingSection);
  return sections.findIndex(
    (item) => normalizeWikiSectionKey(item.section) === incomingKey
  );
}

export function applyModuleWikiUpsert<T extends ModuleWikiSection>(
  current: T[] | undefined,
  payload: Extract<ModuleStreamEvent, { type: "wiki-upsert" }>,
  preserveContentForSection: string | null
) {
  if (!current) return current;
  if (current.length > 0 && current[0].projectId !== payload.projectId) return current;

  const next = [...current];
  const index = findModuleSectionIndex(next, payload.wiki.section);
  const previous = index >= 0 ? next[index] : null;
  const incomingKey = normalizeWikiSectionKey(payload.wiki.section);
  const preserveContent = preserveContentForSection === incomingKey && Boolean(previous);

  const updated = {
    ...(previous ?? {}),
    id: payload.wiki.id,
    projectId: payload.projectId,
    section: payload.wiki.section,
    title: payload.wiki.title,
    content: preserveContent ? (previous?.content ?? payload.wiki.content) : payload.wiki.content,
    yjsState: previous?.yjsState ?? null,
    status: payload.wiki.status,
    order: payload.wiki.order,
    updatedAt: new Date(payload.wiki.updatedAt),
  } as T;

  if (index >= 0) {
    next[index] = updated;
  } else {
    next.push(updated);
  }

  next.sort((a, b) => a.order - b.order);
  return next;
}

export function applyModuleWikiDelete<T extends ModuleWikiSection>(
  current: T[] | undefined,
  payload: Extract<ModuleStreamEvent, { type: "wiki-deleted" }>
) {
  if (!current) return current;
  if (current.length > 0 && current[0].projectId !== payload.projectId) return current;

  const incomingKey = normalizeWikiSectionKey(payload.section);
  return current.filter(
    (item) => normalizeWikiSectionKey(item.section) !== incomingKey
  );
}

export function applyModuleWikiStatus<T extends ModuleWikiSection>(
  current: T[] | undefined,
  payload: Extract<ModuleStreamEvent, { type: "wiki-status" }>
) {
  if (!current) return current;
  if (current.length > 0 && current[0].projectId !== payload.projectId) return current;

  const next = [...current];
  const index = findModuleSectionIndex(next, payload.wiki.section);
  if (index === -1) return current;

  next[index] = {
    ...next[index],
    id: payload.wiki.id,
    status: payload.wiki.status,
    updatedAt: new Date(payload.wiki.updatedAt),
  };

  return next;
}
