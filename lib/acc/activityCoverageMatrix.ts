export type ActivityCoverageBand = "none" | "sparse" | "partial" | "broad";

export interface ActivityCoverageProjectInput {
  id: string;
  name: string | null;
  status: string | null;
}

interface ActivityCoverageCellInput {
  projectId: string | null;
  projectName: string | null;
  service: string | null;
  day: Date | string;
  rows: number | bigint;
  actors: number | bigint;
  attributedRows: number | bigint;
  firstActivityAt?: Date | string | null;
  lastActivityAt: Date | string | null;
}

export interface BuildActivityCoverageMatrixInput {
  from: Date;
  to: Date;
  projects: ActivityCoverageProjectInput[];
  cells: ActivityCoverageCellInput[];
  projectLimit?: number;
  missingProjectLimit?: number;
}

interface ProjectAccumulator {
  projectId: string;
  projectName: string;
  status: string | null;
  rows: number;
  attributedRows: number;
  days: Set<string>;
  services: Set<string>;
  activeCells: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
}

interface ServiceAccumulator {
  service: string;
  rows: number;
  attributedRows: number;
  projects: Set<string>;
  days: Set<string>;
  lastActivityAt: string | null;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function addUtcDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function dayKey(value: Date | string): string {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Date(value).toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toInt(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function normalizeProjectId(projectId: string | null): string {
  const trimmed = (projectId ?? "").trim();
  return trimmed.length > 0 ? trimmed : "(admin)";
}

function normalizeProjectName(
  projectId: string,
  projectName: string | null,
  projectMap: Map<string, ActivityCoverageProjectInput>,
): string {
  if (projectId === "(admin)") return "Admin / Account Activity";
  return projectName?.trim() || projectMap.get(projectId)?.name?.trim() || projectId;
}

function normalizeService(service: string | null): string {
  const trimmed = (service ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : "unknown";
}

function coverageBand(activeDays: number, totalDays: number): ActivityCoverageBand {
  if (activeDays <= 0 || totalDays <= 0) return "none";
  const ratio = activeDays / totalDays;
  if (ratio >= 0.8) return "broad";
  if (ratio >= 0.34) return "partial";
  return "sparse";
}

function upsertProjectAccumulator(
  map: Map<string, ProjectAccumulator>,
  projectId: string,
  projectName: string,
  status: string | null,
): ProjectAccumulator {
  const existing = map.get(projectId);
  if (existing) return existing;
  const next: ProjectAccumulator = {
    projectId,
    projectName,
    status,
    rows: 0,
    attributedRows: 0,
    days: new Set(),
    services: new Set(),
    activeCells: 0,
    firstActivityAt: null,
    lastActivityAt: null,
  };
  map.set(projectId, next);
  return next;
}

function upsertServiceAccumulator(map: Map<string, ServiceAccumulator>, service: string): ServiceAccumulator {
  const existing = map.get(service);
  if (existing) return existing;
  const next: ServiceAccumulator = {
    service,
    rows: 0,
    attributedRows: 0,
    projects: new Set(),
    days: new Set(),
    lastActivityAt: null,
  };
  map.set(service, next);
  return next;
}

function compareNullableIsoAsc(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function compareNullableIsoDesc(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export function buildActivityCoverageMatrix(input: BuildActivityCoverageMatrixInput) {
  const from = startOfUtcDay(input.from);
  const to = endOfUtcDay(input.to);
  const projectLimit = input.projectLimit ?? 75;
  const missingProjectLimit = input.missingProjectLimit ?? 75;
  const projectMap = new Map(input.projects.map((project) => [project.id, project]));
  const projectAccumulators = new Map<string, ProjectAccumulator>();
  const serviceAccumulators = new Map<string, ServiceAccumulator>();
  const activeDays = new Set<string>();

  const days: string[] = [];
  for (let cursor = startOfUtcDay(from); cursor <= to; cursor = addUtcDays(cursor, 1)) {
    days.push(dayKey(cursor));
  }

  const cells = input.cells
    .map((cell) => {
      const projectId = normalizeProjectId(cell.projectId);
      const projectName = normalizeProjectName(projectId, cell.projectName, projectMap);
      const service = normalizeService(cell.service);
      const day = dayKey(cell.day);
      const rows = toInt(cell.rows);
      const attributedRows = toInt(cell.attributedRows);
      const actors = toInt(cell.actors);
      const firstActivityAt = isoOrNull(cell.firstActivityAt) ?? isoOrNull(cell.lastActivityAt);
      const lastActivityAt = isoOrNull(cell.lastActivityAt);
      const status = projectMap.get(projectId)?.status ?? null;

      activeDays.add(day);

      const project = upsertProjectAccumulator(
        projectAccumulators,
        projectId,
        projectName,
        status,
      );
      project.rows += rows;
      project.attributedRows += attributedRows;
      project.days.add(day);
      project.services.add(service);
      project.activeCells += 1;
      project.firstActivityAt = compareNullableIsoAsc(project.firstActivityAt, firstActivityAt);
      project.lastActivityAt = compareNullableIsoDesc(project.lastActivityAt, lastActivityAt);

      const serviceSummary = upsertServiceAccumulator(serviceAccumulators, service);
      serviceSummary.rows += rows;
      serviceSummary.attributedRows += attributedRows;
      serviceSummary.projects.add(projectId);
      serviceSummary.days.add(day);
      serviceSummary.lastActivityAt = compareNullableIsoDesc(serviceSummary.lastActivityAt, lastActivityAt);

      return {
        projectId,
        projectName,
        service,
        day,
        rows,
        actors,
        attributedRows,
        lastActivityAt,
      };
    })
    .sort(
      (a, b) =>
        a.projectName.localeCompare(b.projectName) ||
        a.day.localeCompare(b.day) ||
        a.service.localeCompare(b.service),
    );

  const projects = [...projectAccumulators.values()]
    .map((project) => ({
      projectId: project.projectId,
      projectName: project.projectName,
      status: project.status,
      rows: project.rows,
      attributedRows: project.attributedRows,
      activeDays: project.days.size,
      activeServices: project.services.size,
      activeCells: project.activeCells,
      coverageRatio: days.length > 0 ? project.days.size / days.length : 0,
      coverageBand: coverageBand(project.days.size, days.length),
      firstActivityAt: project.firstActivityAt,
      lastActivityAt: project.lastActivityAt,
    }))
    .sort(
      (a, b) =>
        b.rows - a.rows ||
        b.activeDays - a.activeDays ||
        a.projectName.localeCompare(b.projectName),
    );

  const activeProjectIds = new Set(projects.map((project) => project.projectId));
  const inventoryProjectIdsWithActivity = new Set(
    [...activeProjectIds].filter((projectId) => projectMap.has(projectId)),
  );
  const nonInventoryActivityScopes = [...activeProjectIds].filter(
    (projectId) => !projectMap.has(projectId),
  ).length;
  const missingProjects = input.projects
    .filter((project) => !activeProjectIds.has(project.id))
    .map((project) => ({
      projectId: project.id,
      projectName: project.name?.trim() || project.id,
      status: project.status,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  const services = [...serviceAccumulators.values()]
    .map((service) => ({
      service: service.service,
      rows: service.rows,
      attributedRows: service.attributedRows,
      projects: service.projects.size,
      days: service.days.size,
      lastActivityAt: service.lastActivityAt,
    }))
    .sort((a, b) => b.rows - a.rows || a.service.localeCompare(b.service));

  const rows = cells.reduce((sum, cell) => sum + cell.rows, 0);
  const attributedRows = cells.reduce((sum, cell) => sum + cell.attributedRows, 0);

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: days.length,
    },
    totals: {
      rows,
      attributedRows,
      activeCells: cells.length,
      daysWithActivity: activeDays.size,
      servicesWithActivity: services.length,
      projectsInInventory: input.projects.length,
      projectsWithActivity: inventoryProjectIdsWithActivity.size,
      projectsWithoutActivity: missingProjects.length,
      activityScopesWithActivity: projects.length,
      nonInventoryActivityScopes,
    },
    days,
    services,
    projects: projects.slice(0, projectLimit),
    missingProjects: missingProjects.slice(0, missingProjectLimit),
    cells,
  };
}
