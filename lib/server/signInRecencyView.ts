import "server-only";
import { db } from "@/server/db";

/**
 * Per-project sign-in recency: how long ago each (project, user) membership's
 * account last signed in.
 *
 * DEVIATION (20-02, resolves 20-RESEARCH.md Open Question 1 as Option B): the
 * roadmap/REQUIREMENTS.md name `AccProjectMember.lastSignIn` as the source, but
 * that field is 100% NULL across all 14,566 rows (dead — `AccDcProjectUser.lastSignIn`
 * is equally dead at 22,835/22,835 NULL). This loader instead sources recency from
 * `AccDcUser.lastSignIn` (1,254/3,870 non-null — a real distribution) joined onto
 * each project membership via `AccDcProjectUser` (no Prisma relation exists between
 * AccDcProjectUser.userId and AccDcUser.id — verified; joined in JS by Map, mirroring
 * `lib/acc/dcUserAssembly.ts`). Coverage narrows to DC-covered projects (~550 of 1,153)
 * — callers MUST render an explicit DC-coverage scope caption (see DormantSignInChart).
 */
export interface SignInRecencyRow {
  projectId: string;
  name: string;
  company: string;
  lastSignIn: string | null;
}

interface ProjectUserInput {
  projectId: string;
  userId: string;
}

interface UserInput {
  id: string;
  name: string | null;
  email: string | null;
  companyId: string | null;
  lastSignIn: Date | null;
}

interface CompanyInput {
  id: string;
  name: string;
}

/**
 * Pure assembly — exported for unit testing without a DB connection.
 *
 * Rows whose userId has no matching AccDcUser are kept (honest, not dropped):
 * name falls back to "Unknown user", company to "Unknown company", lastSignIn to
 * null (which the caller's bucketing treats as "Never signed in").
 */
export function assembleSignInRecency(
  projectUsers: ProjectUserInput[],
  users: UserInput[],
  companies: CompanyInput[],
): SignInRecencyRow[] {
  const userById = new Map(users.map((u) => [u.id, u]));
  const companyById = new Map(companies.map((c) => [c.id, c.name]));

  return projectUsers.map((pu) => {
    const user = userById.get(pu.userId);
    const company = user?.companyId ? (companyById.get(user.companyId) ?? "Unknown company") : "Unknown company";
    return {
      projectId: pu.projectId,
      name: user?.name ?? user?.email ?? "Unknown user",
      company,
      lastSignIn: user?.lastSignIn ? user.lastSignIn.toISOString() : null,
    };
  });
}

let cache: { at: number; data: SignInRecencyRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Returns per-project sign-in recency rows with a 5-minute in-process cache.
 * No Prisma access in client components — DB queries live here only.
 */
export async function loadSignInRecency(force = false): Promise<SignInRecencyRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [projectUsers, users, companies] = await Promise.all([
    db.accDcProjectUser.findMany({ select: { projectId: true, userId: true } }),
    db.accDcUser.findMany({ select: { id: true, name: true, email: true, companyId: true, lastSignIn: true } }),
    db.accDcCompany.findMany({ select: { id: true, name: true } }),
  ]);

  const data = assembleSignInRecency(projectUsers, users, companies);
  cache = { at: Date.now(), data };
  return data;
}
