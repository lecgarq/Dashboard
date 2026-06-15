// lib/forma/exportProposal.ts
// Resolve the full effective matrix (inheritance applied) and render JSON / CSV.
// Pure — callers wrap the strings in a Blob for download.
import { TIER_ACTIONS, type FormaTier } from "./tiers";
import type { FormaRole } from "./defaultRoles";
import {
  buildFolderIndex, resolveEffectiveTier, type FormaFolder,
} from "./inheritance";

export interface ExportInput {
  templateProjectId: string;
  templateName: string;
  roles: FormaRole[];
  folders: FormaFolder[];
  assignments: Record<string, Record<string, FormaTier>>;
}

/** roleId → folderId → effective tier (inheritance resolved). */
export function buildEffectiveMatrix(
  input: ExportInput,
): Record<string, Record<string, FormaTier>> {
  const { byId } = buildFolderIndex(input.folders);
  const out: Record<string, Record<string, FormaTier>> = {};
  for (const role of input.roles) {
    const explicit = input.assignments[role.id] ?? {};
    const row: Record<string, FormaTier> = {};
    for (const f of input.folders) {
      row[f.id] = resolveEffectiveTier(f.id, explicit, byId).tier;
    }
    out[role.id] = row;
  }
  return out;
}

export function toJson(input: ExportInput): string {
  return JSON.stringify(
    {
      template: { id: input.templateProjectId, name: input.templateName },
      roles: input.roles,
      folders: input.folders.map((f) => ({ id: f.id, path: f.fullPath ?? f.name })),
      matrix: buildEffectiveMatrix(input),
      tierActions: TIER_ACTIONS,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(input: ExportInput): string {
  const matrix = buildEffectiveMatrix(input);
  const header = ["Folder Path", ...input.roles.map((r) => r.label)].map(csvCell).join(",");
  const sorted = [...input.folders].sort((a, b) =>
    (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name),
  );
  const rows = sorted.map((f) => {
    const path = f.fullPath ?? f.name;
    const cells = input.roles.map((r) => matrix[r.id][f.id]);
    return [path, ...cells].map(csvCell).join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}
