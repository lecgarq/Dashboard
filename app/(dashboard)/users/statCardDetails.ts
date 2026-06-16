import type { ProjectData } from "./AccProfileSection";

export interface CountSlice {
  name: string;
  value: number;
}

/** ACC module key → friendly label. Mirrors ALL_MODULES in AccProfileSection.tsx. */
const MODULE_LABELS: Record<string, string> = {
  datum: "Datum",
  documentManagement: "Forma Data Management",
  designCollaboration: "Forma Design Collaboration",
  modelCoordination: "Model Coordination",
  preconstruction: "Preconstruction",
  autoSpecs: "AutoSpecs",
  build: "Build",
  insight: "Insight",
  design: "Design",
};

export function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

/** Projects where the user is an admin: active-first, then by name. */
export function adminProjects(projects: readonly ProjectData[]): ProjectData[] {
  return projects
    .filter((p) => p.isAdmin)
    .sort(
      (a, b) =>
        (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
        a.name.localeCompare(b.name),
    );
}

function countBy(
  projects: readonly ProjectData[],
  pick: (p: ProjectData) => readonly string[] | undefined,
  label: (s: string) => string,
): CountSlice[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const seen = new Set<string>(); // a project counts at most once per name
    for (const raw of pick(p) ?? []) {
      const name = label(raw);
      if (seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** One slice per distinct role; value = number of projects carrying that role. */
export function roleCounts(projects: readonly ProjectData[]): CountSlice[] {
  return countBy(projects, (p) => p.roles, (s) => s);
}

/** One slice per distinct module (friendly label); value = number of projects using it. */
export function moduleCounts(projects: readonly ProjectData[]): CountSlice[] {
  return countBy(projects, (p) => p.modules, moduleLabel);
}
