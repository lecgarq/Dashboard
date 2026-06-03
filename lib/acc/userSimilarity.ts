/**
 * Pure similarity-score computation for the user-only graph topology.
 *
 * Phase 07.1 redesign: 7 positional dimensions, each normalized to [0, 1].
 * Two set-overlap types and one temporal-decay type.
 *
 *   Set overlap:    project-members, roles, folder-permissions,
 *                   activity-logs, data-coverage
 *   Temporal decay: last-sign-in, recent-additions
 *
 * The previous Phase 7 model exposed raw `sharedCount` integers. The new
 * model emits normalized scores so all 7 dimensions can be summed with
 * per-dim strength multipliers without scale mismatch.
 *
 * No Prisma / React / server imports — pure data in, pure data out.
 */

import { temporalDecay } from "./similarityDecay";

export type SimilarityDim =
  | "project-members"
  | "roles"
  | "folder-permissions"
  | "activity-logs"
  | "data-coverage"
  | "last-sign-in"
  | "recent-additions"
  | "admin-tier"
  | "internal-external"
  | "company-role"
  | "module-mix"
  | "firm-affiliation";

export const SIMILARITY_DIMS: readonly SimilarityDim[] = [
  "project-members",
  "roles",
  "folder-permissions",
  "activity-logs",
  "data-coverage",
  "last-sign-in",
  "recent-additions",
  "admin-tier",
  "internal-external",
  "company-role",
  "module-mix",
  // firm-affiliation: default strength 0 until WS2 anti-clique rules — see spec §4a
  "firm-affiliation",
] as const;

export interface SimilarityUser {
  id: string;
  projectIds: readonly string[];
  roleIds: readonly string[];
  folderIds: readonly string[];
  activityFileIds: readonly string[];
  coverageFlags: readonly string[];
  lastSignIn: number | null;
  addedAt: number | null;
  /** Binary axis dims (added 2026-05-18): exact match → 1, mismatch → 0. */
  isAdmin?: boolean;
  isExternal?: boolean;
  /** Company role / job title bucket. Null treated as a distinct "unspecified" bucket. */
  companyRole?: string | null;
  /** ACC module ids the user touches — set-overlap dim. */
  moduleIds?: readonly string[];
  /** Company/firm identifier. Null treated as no-match (NOT a shared "unknown" bucket). */
  firmId?: string | null;
}

export interface SimilarityInput {
  users: readonly SimilarityUser[];
}

export interface SimilarityEdge {
  userA: string;
  userB: string;
  dimension: SimilarityDim;
  /** Normalized similarity score in [0, 1]. */
  score: number;
}

/**
 * Normalized set-overlap score in [0, 1]: |A ∩ B| / min(|A|, |B|).
 * Returns 0 if either set is empty.
 */
function setOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const x of a) if (setB.has(x)) shared++;
  return shared / Math.min(a.length, b.length);
}

/**
 * Per-pair, per-dim similarity in [0, 1].
 * Exported so the layout consumer and tests can both reach it without
 * going through edge construction.
 */
export function pairSimilarity(
  a: SimilarityUser,
  b: SimilarityUser,
  dim: SimilarityDim,
): number {
  switch (dim) {
    case "project-members":
      return setOverlap(a.projectIds, b.projectIds);
    case "roles":
      return setOverlap(a.roleIds, b.roleIds);
    case "folder-permissions":
      return setOverlap(a.folderIds, b.folderIds);
    case "activity-logs":
      return setOverlap(a.activityFileIds, b.activityFileIds);
    case "data-coverage":
      return setOverlap(a.coverageFlags, b.coverageFlags);
    case "last-sign-in":
      return temporalDecay(a.lastSignIn, b.lastSignIn);
    case "recent-additions":
      return temporalDecay(a.addedAt, b.addedAt);
    case "admin-tier":
      // Binary axis: same admin status = full pull. Undefined treated as non-admin
      // so missing data degrades to the "non-admin vs non-admin" bucket.
      return (!!a.isAdmin) === (!!b.isAdmin) ? 1 : 0;
    case "internal-external":
      return (!!a.isExternal) === (!!b.isExternal) ? 1 : 0;
    case "company-role":
      // Null/undefined company role becomes its own "Unspecified" bucket so
      // users without a title still cluster with each other.
      return (a.companyRole ?? null) === (b.companyRole ?? null) ? 1 : 0;
    case "module-mix":
      return setOverlap(a.moduleIds ?? [], b.moduleIds ?? []);
    case "firm-affiliation":
      // Same firm = 1, but treat missing firm as no-match (NOT a shared "unknown" bucket)
      // so large "no firm" groups do not form cliques. Default OFF: caller strength is 0
      // until WS2 defines anti-clique rules.
      return a.firmId != null && a.firmId === b.firmId ? 1 : 0;
  }
}

/**
 * Combined weighted force per pair across enabled dims, gated by simMin.
 *
 *   force(a, b) = Σ_d strength_d × pairSimilarity_d(a, b)
 *
 * Returns 0 unless at least `simMin` dimensions contribute non-zero
 * (strength > 0 AND score > 0). simMin acts as a layout-only threshold.
 */
export function combinedPairForce(
  a: SimilarityUser,
  b: SimilarityUser,
  strengths: ReadonlyMap<SimilarityDim, number>,
  simMin: number,
): number {
  let sum = 0;
  let contributingDimCount = 0;
  for (const dim of SIMILARITY_DIMS) {
    const strength = strengths.get(dim) ?? 0;
    if (strength <= 0) continue;
    const score = pairSimilarity(a, b, dim);
    if (score <= 0) continue;
    sum += strength * score;
    contributingDimCount++;
  }
  return contributingDimCount >= simMin ? sum : 0;
}

export interface NeighborForce {
  neighborId: string;
  force: number;
  /** The dim with the largest strength×score contribution. Drives hover-line color. */
  dominantDim: SimilarityDim | null;
}

export function topKNeighbors(
  input: SimilarityInput,
  strengths: ReadonlyMap<SimilarityDim, number>,
  simMin: number,
  k: number,
): Map<string, NeighborForce[]> {
  const out = new Map<string, NeighborForce[]>();
  const users = input.users;

  // Performance Safeguard: If the user count is massive, sample or cap to prevent main thread lockup
  const maxUsers = 600;
  const sampleUsers = users.length > maxUsers 
    ? users.slice(0, maxUsers) 
    : users;

  // Pre-convert sets once for all sampled users
  const cachedSets = sampleUsers.map((u) => ({
    projectIds: new Set(u.projectIds),
    roleIds: new Set(u.roleIds),
    folderIds: new Set(u.folderIds),
    activityFileIds: new Set(u.activityFileIds),
    coverageFlags: new Set(u.coverageFlags),
    moduleIds: new Set(u.moduleIds ?? []),
  }));

  // Helper for extremely fast set overlap using cached sets
  function setOverlapCached(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let shared = 0;
    const [small, large] = setA.size < setB.size ? [setA, setB] : [setB, setA];
    for (const x of small) {
      if (large.has(x)) shared++;
    }
    return shared / Math.min(setA.size, setB.size);
  }

  for (let i = 0; i < sampleUsers.length; i++) {
    const a = sampleUsers[i];
    const setA = cachedSets[i];
    const candidates: NeighborForce[] = [];
    for (let j = 0; j < sampleUsers.length; j++) {
      if (i === j) continue;
      const b = sampleUsers[j];
      const setB = cachedSets[j];

      let sum = 0;
      let contributingDimCount = 0;
      let bestDim: SimilarityDim | null = null;
      let bestContrib = 0;

      for (const dim of SIMILARITY_DIMS) {
        const strength = strengths.get(dim) ?? 0;
        if (strength <= 0) continue;

        let score = 0;
        switch (dim) {
          case "project-members":
            score = setOverlapCached(setA.projectIds, setB.projectIds);
            break;
          case "roles":
            score = setOverlapCached(setA.roleIds, setB.roleIds);
            break;
          case "folder-permissions":
            score = setOverlapCached(setA.folderIds, setB.folderIds);
            break;
          case "activity-logs":
            score = setOverlapCached(setA.activityFileIds, setB.activityFileIds);
            break;
          case "data-coverage":
            score = setOverlapCached(setA.coverageFlags, setB.coverageFlags);
            break;
          case "last-sign-in":
            score = temporalDecay(a.lastSignIn, b.lastSignIn);
            break;
          case "recent-additions":
            score = temporalDecay(a.addedAt, b.addedAt);
            break;
          case "admin-tier":
            score = (!!a.isAdmin) === (!!b.isAdmin) ? 1 : 0;
            break;
          case "internal-external":
            score = (!!a.isExternal) === (!!b.isExternal) ? 1 : 0;
            break;
          case "company-role":
            score = (a.companyRole ?? null) === (b.companyRole ?? null) ? 1 : 0;
            break;
          case "module-mix":
            score = setOverlapCached(setA.moduleIds, setB.moduleIds);
            break;
          case "firm-affiliation":
            score = a.firmId != null && a.firmId === b.firmId ? 1 : 0;
            break;
        }

        if (score <= 0) continue;

        const contrib = strength * score;
        sum += contrib;
        contributingDimCount++;

        if (contrib > bestContrib) {
          bestContrib = contrib;
          bestDim = dim;
        }
      }

      const force = contributingDimCount >= simMin ? sum : 0;
      if (force <= 0) continue;

      candidates.push({ neighborId: b.id, force, dominantDim: bestDim });
    }
    candidates.sort((x, y) => y.force - x.force);
    out.set(a.id, candidates.slice(0, k));
  }

  // Backfill empty entries for non-sampled users to ensure complete map structure
  for (const u of users) {
    if (!out.has(u.id)) {
      out.set(u.id, []);
    }
  }

  return out;
}

/**
 * Edge-list view of pair similarities. Retained for backward compatibility
 * with Phase 7's `accGraphOrganicLayout` user-similarity link emission.
 * Layout-consumer code (Wave 3 of Phase 07.1) calls `topKNeighbors` directly.
 *
 * @deprecated Prefer `topKNeighbors` + the layout consumer's top-K pass.
 */
export function computeSimilarityEdges(
  input: SimilarityInput,
  enabledDims: ReadonlySet<SimilarityDim>,
  minScore: number = 0.01,
): SimilarityEdge[] {
  const users = input.users;
  const edges: SimilarityEdge[] = [];
  
  // Performance Safeguard: If users length is large, limit to prevent browser freeze.
  const maxUsers = 300;
  const sampleUsers = users.length > maxUsers 
    ? users.slice(0, maxUsers) 
    : users;

  // Pre-convert sets once for all sampled users
  const cachedSets = sampleUsers.map((u) => ({
    projectIds: new Set(u.projectIds),
    roleIds: new Set(u.roleIds),
    folderIds: new Set(u.folderIds),
    activityFileIds: new Set(u.activityFileIds),
    coverageFlags: new Set(u.coverageFlags),
    moduleIds: new Set(u.moduleIds ?? []),
  }));

  // Helper for extremely fast set overlap using cached sets
  function setOverlapCached(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let shared = 0;
    const [small, large] = setA.size < setB.size ? [setA, setB] : [setB, setA];
    for (const x of small) {
      if (large.has(x)) shared++;
    }
    return shared / Math.min(setA.size, setB.size);
  }

  for (let i = 0; i < sampleUsers.length; i++) {
    const a = sampleUsers[i];
    const setA = cachedSets[i];
    for (let j = i + 1; j < sampleUsers.length; j++) {
      const b = sampleUsers[j];
      const setB = cachedSets[j];

      for (const dim of enabledDims) {
        let score = 0;
        switch (dim) {
          case "project-members":
            score = setOverlapCached(setA.projectIds, setB.projectIds);
            break;
          case "roles":
            score = setOverlapCached(setA.roleIds, setB.roleIds);
            break;
          case "folder-permissions":
            score = setOverlapCached(setA.folderIds, setB.folderIds);
            break;
          case "activity-logs":
            score = setOverlapCached(setA.activityFileIds, setB.activityFileIds);
            break;
          case "data-coverage":
            score = setOverlapCached(setA.coverageFlags, setB.coverageFlags);
            break;
          case "last-sign-in":
            score = temporalDecay(a.lastSignIn, b.lastSignIn);
            break;
          case "recent-additions":
            score = temporalDecay(a.addedAt, b.addedAt);
            break;
          case "admin-tier":
            score = (!!a.isAdmin) === (!!b.isAdmin) ? 1 : 0;
            break;
          case "internal-external":
            score = (!!a.isExternal) === (!!b.isExternal) ? 1 : 0;
            break;
          case "company-role":
            score = (a.companyRole ?? null) === (b.companyRole ?? null) ? 1 : 0;
            break;
          case "module-mix":
            score = setOverlapCached(setA.moduleIds, setB.moduleIds);
            break;
          case "firm-affiliation":
            score = a.firmId != null && a.firmId === b.firmId ? 1 : 0;
            break;
        }

        if (score >= minScore) {
          edges.push({
            userA: a.id,
            userB: b.id,
            dimension: dim,
            score,
          });
        }
      }
    }
  }
  return edges;
}
