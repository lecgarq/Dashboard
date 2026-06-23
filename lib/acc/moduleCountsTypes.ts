/**
 * Row type for the "Module activity" donut view.
 * Extracted from app/(dashboard)/access-analysis/moduleCounts.ts so that
 * lib/server/moduleActivityView.ts can import the row type without creating a
 * lib -> app reverse dependency. moduleCounts.ts re-exports this type unchanged.
 */
export interface ModuleActivityRow {
  projectId: string;
  projectName: string;
  rawAction: string;
  count: number;
}
