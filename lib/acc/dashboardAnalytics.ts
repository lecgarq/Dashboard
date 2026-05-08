/**
 * Dashboard analytics — pure-function findings over BulkAccUser[].
 *
 * Plan 04-03 / DASH-03 / DASH-04 / DASH-05 / DASH-09.
 *
 * Three independent finders + one composing entry point:
 *   - findJunkRoles            (DASH-03)   — tiered HIGH/MEDIUM/LOW per signal count
 *   - findDuplicateRoles       (DASH-04)   — identical modules + ≥80% name overlap
 *   - findOutlierModuleCombos  (DASH-05)   — module sets held by < 5% of members
 *   - computeAllFindings       (DASH-09)   — aggregates + roleSeverityIndex Map
 *
 * Design notes:
 *
 * 1. "Zero members" semantics (junk-role signal 1):
 *    A role can only enter the data via either (a) user.allRoles or (b) any
 *    project.roles. We treat a role as having "zero members" when it appears in
 *    user.allRoles but is NOT bound to any project assignment in the dataset.
 *    This is the closest user-derived proxy for "role exists in catalog but is
 *    unassigned"; a real account-level role catalog is out of scope for 04-03.
 *
 * 2. "Identical modules" for duplicate detection (Open Q3 in RESEARCH.md):
 *    Module sets are aggregated at the role-AGGREGATE level — i.e. the union of
 *    all project.modules across every project where the role appears. This
 *    matches the user's mental model of "this role grants these modules". A
 *    role-instance comparison would be a future refinement.
 *
 * 3. Module-overlap: by spec, duplicate detection requires STRICT module-set
 *    equality (moduleOverlap === 1.0). We do not surface partial-overlap pairs.
 *
 * 4. roleSeverityIndex aggregation rule:
 *    HIGH > MEDIUM > LOW. Junk findings contribute their tiered severity. Every
 *    role flagged in a duplicate pair contributes severity MEDIUM (duplicates are
 *    "review and potentially merge" — middling priority). The map stores the
 *    MAX severity seen per role.
 */

import type { BulkAccUser } from "./acc-types";
import { nameTokenOverlap, DUPLICATE_ROLE_NAME_THRESHOLD } from "./nameSimilarity";
import { differenceInDays, parseISO, isValid } from "date-fns";

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface JunkRoleFinding {
  role: string;
  severity: Severity;
  signals: {
    zeroMembers: boolean;
    zeroModules: boolean;
    allInactive90d: boolean;
  };
  affectedMembers: string[];
  affectedProjects: string[];
}

export interface DuplicateRoleFinding {
  roleA: string;
  roleB: string;
  moduleOverlap: 1.0;
  nameOverlap: number;
  affectedMembers: string[];
  affectedProjects: string[];
}

export interface OutlierFinding {
  moduleSet: string[];
  memberCount: number;
  totalMembers: number;
  pct: number;
  affectedMembers: string[];
}

export interface DashboardFindings {
  junkRoles: JunkRoleFinding[];
  duplicateRoles: DuplicateRoleFinding[];
  outlierCombos: OutlierFinding[];
  /** role name → highest severity (HIGH > MEDIUM > LOW). Used by inline badges. */
  roleSeverityIndex: Map<string, Severity>;
}

const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/** Returns true when lastSignIn is null/undefined/invalid OR strictly older than 90 days from `now`. */
function isInactive90d(lastSignIn: string | null | undefined, now: Date): boolean {
  if (lastSignIn == null) return true;
  let parsed: Date;
  try {
    parsed = parseISO(lastSignIn);
  } catch {
    return true;
  }
  if (!isValid(parsed)) return true;
  const days = differenceInDays(now, parsed);
  if (Number.isNaN(days)) return true;
  return days > 90;
}

/** Per-role aggregate — built once and reused by junk + duplicate finders. */
interface RoleAggregate {
  role: string;
  members: Set<string>;       // user emails that have this role anywhere
  modules: Set<string>;       // union of all modules across all project assignments
  projects: Set<string>;      // project NAMES where this role is bound
  inActiveAssignments: number; // number of (user × project) bindings where role appears
}

function aggregateByRole(users: BulkAccUser[]): Map<string, RoleAggregate> {
  const agg = new Map<string, RoleAggregate>();
  const ensure = (role: string): RoleAggregate => {
    let a = agg.get(role);
    if (!a) {
      a = {
        role,
        members: new Set(),
        modules: new Set(),
        projects: new Set(),
        inActiveAssignments: 0,
      };
      agg.set(role, a);
    }
    return a;
  };

  for (const u of users) {
    // Roles via project assignments — establishes membership + modules + projects.
    for (const p of u.projects) {
      for (const role of p.roles) {
        const a = ensure(role);
        a.members.add(u.email);
        a.projects.add(p.name);
        for (const m of p.modules) a.modules.add(m);
        a.inActiveAssignments++;
      }
    }
    // Roles in user.allRoles but never bound to any project assignment surface as
    // candidates here so the "zero-member orphan" case is detectable downstream.
    for (const role of u.allRoles) {
      ensure(role);
    }
  }
  return agg;
}

// ─── findJunkRoles (DASH-03) ─────────────────────────────────────────────────

export function findJunkRoles(users: BulkAccUser[], now: Date): JunkRoleFinding[] {
  const agg = aggregateByRole(users);
  const findings: JunkRoleFinding[] = [];

  for (const a of agg.values()) {
    const zeroMembers = a.members.size === 0;
    const zeroModules = a.modules.size === 0;
    // allInactive90d: vacuously true if no members; otherwise every member must be inactive >90d.
    let allInactive90d: boolean;
    if (zeroMembers) {
      allInactive90d = true;
    } else {
      allInactive90d = users
        .filter((u) => a.members.has(u.email))
        .every((u) => isInactive90d(u.lastSignIn, now));
    }

    const signalCount =
      (zeroMembers ? 1 : 0) + (zeroModules ? 1 : 0) + (allInactive90d ? 1 : 0);
    if (signalCount === 0) continue;

    const severity: Severity =
      signalCount === 3 ? "HIGH" : signalCount === 2 ? "MEDIUM" : "LOW";

    findings.push({
      role: a.role,
      severity,
      signals: { zeroMembers, zeroModules, allInactive90d },
      affectedMembers: [...a.members].sort(),
      affectedProjects: [...a.projects].sort(),
    });
  }

  return findings;
}

// ─── findDuplicateRoles (DASH-04) ────────────────────────────────────────────

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function findDuplicateRoles(users: BulkAccUser[]): DuplicateRoleFinding[] {
  const agg = aggregateByRole(users);
  // Only roles that actually have members + modules can be duplicates of each other.
  const roles = [...agg.values()].filter((a) => a.members.size > 0 && a.modules.size > 0);

  const findings: DuplicateRoleFinding[] = [];
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const A = roles[i];
      const B = roles[j];
      if (!setsEqual(A.modules, B.modules)) continue;
      const overlap = nameTokenOverlap(A.role, B.role);
      if (overlap < DUPLICATE_ROLE_NAME_THRESHOLD) continue;

      const members = new Set<string>([...A.members, ...B.members]);
      const projects = new Set<string>([...A.projects, ...B.projects]);
      findings.push({
        roleA: A.role,
        roleB: B.role,
        moduleOverlap: 1.0,
        nameOverlap: overlap,
        affectedMembers: [...members].sort(),
        affectedProjects: [...projects].sort(),
      });
    }
  }
  return findings;
}

// ─── findOutlierModuleCombos (DASH-05) ──────────────────────────────────────

export function findOutlierModuleCombos(
  users: BulkAccUser[],
  thresholdPct = 0.05,
): OutlierFinding[] {
  if (users.length === 0) return [];

  const sigToMembers = new Map<string, { modules: string[]; members: string[] }>();
  for (const u of users) {
    const normalized = [...new Set(u.allModules)].sort();
    const sig = normalized.join("|");
    let bucket = sigToMembers.get(sig);
    if (!bucket) {
      bucket = { modules: normalized, members: [] };
      sigToMembers.set(sig, bucket);
    }
    bucket.members.push(u.email);
  }

  const total = users.length;
  const findings: OutlierFinding[] = [];
  for (const bucket of sigToMembers.values()) {
    const pct = bucket.members.length / total;
    if (pct < thresholdPct) {
      findings.push({
        moduleSet: bucket.modules,
        memberCount: bucket.members.length,
        totalMembers: total,
        pct,
        affectedMembers: [...bucket.members].sort(),
      });
    }
  }
  return findings;
}

// ─── computeAllFindings (DASH-09) ───────────────────────────────────────────

export function computeAllFindings(
  users: BulkAccUser[],
  now: Date = new Date(),
): DashboardFindings {
  const junkRoles = findJunkRoles(users, now);
  const duplicateRoles = findDuplicateRoles(users);
  const outlierCombos = findOutlierModuleCombos(users);

  const roleSeverityIndex = new Map<string, Severity>();
  const bump = (role: string, sev: Severity) => {
    const prev = roleSeverityIndex.get(role);
    if (!prev || SEVERITY_RANK[sev] > SEVERITY_RANK[prev]) {
      roleSeverityIndex.set(role, sev);
    }
  };
  for (const j of junkRoles) bump(j.role, j.severity);
  for (const d of duplicateRoles) {
    bump(d.roleA, "MEDIUM");
    bump(d.roleB, "MEDIUM");
  }

  return { junkRoles, duplicateRoles, outlierCombos, roleSeverityIndex };
}
