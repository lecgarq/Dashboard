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
  /** Autodesk's own coarse service tag (AccActivity.service / AccActivityAccds.serviceGroup),
   *  when populated. Optional/additive -- existing literal constructors that omit it still
   *  type-check. Consumed by classifyActivity's service-first precedence (21.1-01). */
  service?: string | null;
}
