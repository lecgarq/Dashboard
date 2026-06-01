import "server-only";
import { db } from "@/server/db";
import { reduceModules } from "@/app/(dashboard)/access-analysis/modules";
import type { AccessInstance } from "@/app/(dashboard)/access-analysis/types";

const INTERNAL_DOMAIN = "@hermosillo.com";

export interface RawDc {
  projectUsers: Array<{ projectId: string; userId: string; status: string | null; addedOn: Date | null }>;
  users: Array<{ id: string; email: string | null; name: string | null }>;
  projects: Array<{ id: string; name: string }>;
  products: Array<{ projectId: string; userId: string; productKey: string; accessLevel: string }>;
  roles: Array<{ projectId: string; userId: string; roleId: string }>;
  roleNames: Array<{ id: string; name: string }>;
  companies: Array<{ projectId: string; userId: string; companyId: string }>;
  companyNames: Array<{ id: string; name: string }>;
}

export function buildInstanceView(raw: RawDc): AccessInstance[] {
  const userById = new Map(raw.users.map((u) => [u.id, u]));
  const projectById = new Map(raw.projects.map((p) => [p.id, p]));
  const roleNameById = new Map(raw.roleNames.map((r) => [r.id, r.name]));
  const companyNameById = new Map(raw.companyNames.map((c) => [c.id, c.name]));
  const key = (projectId: string, userId: string) => `${projectId}::${userId}`;

  const productsByKey = new Map<string, Array<{ productKey: string; accessLevel: string }>>();
  for (const p of raw.products) {
    const k = key(p.projectId, p.userId);
    (productsByKey.get(k) ?? productsByKey.set(k, []).get(k)!).push({ productKey: p.productKey, accessLevel: p.accessLevel });
  }
  const rolesByKey = new Map<string, string[]>();
  for (const r of raw.roles) {
    const name = roleNameById.get(r.roleId);
    if (!name) continue;
    const k = key(r.projectId, r.userId);
    (rolesByKey.get(k) ?? rolesByKey.set(k, []).get(k)!).push(name);
  }
  const companyByKey = new Map<string, string>();
  for (const c of raw.companies) {
    const name = companyNameById.get(c.companyId);
    if (name) companyByKey.set(key(c.projectId, c.userId), name);
  }

  return raw.projectUsers.map((pu) => {
    const k = key(pu.projectId, pu.userId);
    const u = userById.get(pu.userId);
    const email = (u?.email ?? "").toLowerCase();
    const { modules, adminModules } = reduceModules(productsByKey.get(k) ?? []);
    return {
      projectId: pu.projectId,
      projectName: projectById.get(pu.projectId)?.name ?? pu.projectId,
      userId: pu.userId,
      email,
      name: u?.name ?? email ?? pu.userId,
      isInternal: email.endsWith(INTERNAL_DOMAIN),
      isAdmin: adminModules.length > 0,
      status: pu.status,
      addedOn: pu.addedOn ? pu.addedOn.toISOString().slice(0, 10) : null,
      company: companyByKey.get(k) ?? null,
      roles: rolesByKey.get(k) ?? [],
      modules,
      adminModules,
    };
  });
}

let cache: { at: number; view: AccessInstance[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadInstanceView(force = false): Promise<AccessInstance[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.view;
  const [projectUsers, users, projects, products, roles, roleNames, companies, companyNames] = await Promise.all([
    db.accDcProjectUser.findMany({ select: { projectId: true, userId: true, status: true, addedOn: true } }),
    db.accDcUser.findMany({ select: { id: true, email: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    db.accDcProjectUserProduct.findMany({ select: { projectId: true, userId: true, productKey: true, accessLevel: true } }),
    db.accDcProjectUserRole.findMany({ select: { projectId: true, userId: true, roleId: true } }),
    db.accDcRole.findMany({ select: { id: true, name: true } }),
    db.accDcProjectUserCompany.findMany({ select: { projectId: true, userId: true, companyId: true } }),
    db.accDcCompany.findMany({ select: { id: true, name: true } }),
  ]);
  const view = buildInstanceView({ projectUsers, users, projects, products, roles, roleNames, companies, companyNames });
  cache = { at: Date.now(), view };
  return view;
}
