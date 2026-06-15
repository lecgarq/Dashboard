// lib/forma/draftStorage.ts
// Pure (de)serialization for the localStorage draft. No localStorage / Date here
// — the React hook supplies "now" and performs the I/O, keeping this testable.
import type { FormaTier } from "./tiers";
import type { FormaRole } from "./defaultRoles";

export const DRAFT_VERSION = 1;

export interface FormaDraft {
  version: number;
  templateProjectId: string;
  roles: FormaRole[];
  /** roleId → folderId → tier (explicit overrides only). */
  assignments: Record<string, Record<string, FormaTier>>;
  updatedAt: string; // ISO
}

export function storageKey(templateProjectId: string): string {
  return `forma-proposal:${templateProjectId}:v${DRAFT_VERSION}`;
}

export function emptyDraft(
  templateProjectId: string,
  roles: FormaRole[],
  nowIso: string,
): FormaDraft {
  return {
    version: DRAFT_VERSION,
    templateProjectId,
    roles: roles.map((r) => ({ ...r })), // own copy
    assignments: {},
    updatedAt: nowIso,
  };
}

export function serializeDraft(draft: FormaDraft): string {
  return JSON.stringify(draft);
}

export function parseDraft(raw: string | null): FormaDraft | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const d = obj as Partial<FormaDraft>;
  if (d.version !== DRAFT_VERSION) return null; // future: migrate instead of drop
  if (typeof d.templateProjectId !== "string") return null;
  if (!Array.isArray(d.roles)) return null;
  if (typeof d.assignments !== "object" || d.assignments === null) return null;
  if (typeof d.updatedAt !== "string") return null;
  return d as FormaDraft;
}
