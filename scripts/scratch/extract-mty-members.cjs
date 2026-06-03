#!/usr/bin/env node
/**
 * scripts/scratch/extract-mty-members.cjs
 *
 * Systematic bulk extraction of project members (users, roles, company, products)
 * for all active Monterrey (MTY) projects using standard 2-legged tokens.
 * ZERO Data Connector quota used!
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const path = require("node:path");
const fs = require("node:fs");

require("dotenv").config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const HQ_V2_BASE = "https://developer.api.autodesk.com/hq/v2";
const ACC_ADMIN_V1_BASE = "https://developer.api.autodesk.com/construction/admin/v1";
const MEMBER_FIELDS = "name,email,status,companyId,phone,addedOn,accessLevels,products,roles,autodeskId";

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[mty-members-extract ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[mty-members-extract ${ts()}]`, ...args); }

// Helper to acquire a 2-legged token
async function get2LegToken() {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("APS_CLIENT_ID / APS_CLIENT_SECRET not configured");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "account:read data:read data:create",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("2-leg token acquisition failed: " + JSON.stringify(json));
  return json.access_token;
}

// Fetch project roles to resolve role names to role IDs
async function fetchProjectRoles(accountId, projectId, accessToken) {
  const url = `${HQ_V2_BASE}/accounts/${accountId}/projects/${projectId}/industry_roles`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Project roles failed: ${res.status} ${await res.text()}`);
  }
  const items = await res.json();
  const mapped = [];
  for (const raw of items) {
    if (!raw.id || !raw.name) continue;
    const services = raw.services || {};
    const docsAccessLevel = services.document_management?.access_level || services.documentManagement?.access_level || null;
    const projectAdminAccessLevel = services.project_administration?.access_level || services.projectAdministration?.access_level || null;
    mapped.push({
      id: String(raw.id),
      name: String(raw.name),
      docsAccessLevel,
      projectAdminAccessLevel,
    });
  }
  return mapped;
}

// Fetch all companies for the account to map company ID to company name
async function fetchAccountCompanies(accountId, accessToken) {
  const companies = [];
  let offset = 0;
  const limit = 200;
  
  while (true) {
    const url = `${ACC_ADMIN_V1_BASE}/accounts/${accountId}/companies?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      logErr(`Warning: Failed to fetch account companies: ${res.status} ${await res.text()}. Company names will not be resolved.`);
      break;
    }
    const data = await res.json();
    const results = data.results || [];
    companies.push(...results);
    if (results.length < limit) break;
    offset += limit;
  }
  
  const map = new Map();
  for (const c of companies) {
    if (c.id && c.name) {
      map.set(c.id, c.name);
    }
  }
  return map;
}

// Fetch members of a single project, handling pagination
async function fetchProjectMembers(projectId, accessToken) {
  const all = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const url = `${ACC_ADMIN_V1_BASE}/projects/${projectId}/users?limit=${limit}&offset=${offset}&fields=${MEMBER_FIELDS}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Project members failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const results = data.results || [];
    all.push(...results);
    if (results.length < limit) break;
    offset += limit;
  }
  return all;
}

const PRODUCT_ALIASES = {
  documentManagement: "docs",
  fieldManagement: "build",
  costManagement: "cost",
};

function normalizeProducts(raw) {
  const result = {};
  if (!raw || !Array.isArray(raw)) return result;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rawKey = entry.key;
    const rawAccess = entry.access;
    if (!rawKey || !rawAccess) continue;
    const key = PRODUCT_ALIASES[rawKey] ?? rawKey;
    result[key] = rawAccess;
  }
  return result;
}

// Safely merge new project membership into existing user cache row
async function mergeAndUpsertUserCache(prisma, email, autodeskId, name, projectMembership, syncedAt) {
  const existing = await prisma.accMemberCache.findUnique({
    where: { email },
  });

  let data = null;
  if (existing && existing.data) {
    try {
      data = typeof existing.data === "string" ? JSON.parse(existing.data) : existing.data;
    } catch (e) {
      data = null;
    }
  }

  const projectBlob = {
    id: projectMembership.projectId,
    name: projectMembership.projectName,
    status: "active",
    isAdmin: projectMembership.projectAdmin,
    roles: projectMembership.roles,
    modules: projectMembership.modules,
  };

  if (data && data.found) {
    // Merge project into existing list
    const projects = data.projects || [];
    const idx = projects.findIndex((p) => p.id === projectBlob.id);
    if (idx >= 0) {
      projects[idx] = projectBlob;
    } else {
      projects.push(projectBlob);
    }

    data.projects = projects;
    data.projectCount = projects.length;
    data.activeCount = projects.filter((p) => p.status === "active").length;
    data.adminCount = projects.filter((p) => p.isAdmin).length;
    data.hasNoProjects = projects.length === 0;

    // Union of all roles
    const allRoles = new Set(data.allRoles || []);
    projectBlob.roles.forEach((r) => allRoles.add(r));
    data.allRoles = Array.from(allRoles);

    // Union of all modules
    const allModules = new Set(data.allModules || []);
    projectBlob.modules.forEach((m) => allModules.add(m));
    data.allModules = Array.from(allModules);

    // Update dates
    if (projectMembership.lastSignIn) {
      if (!data.lastSignIn || projectMembership.lastSignIn > data.lastSignIn) {
        data.lastSignIn = projectMembership.lastSignIn;
      }
    }
    if (projectMembership.addedOn) {
      if (!data.addedOn || projectMembership.addedOn < data.addedOn) {
        data.addedOn = projectMembership.addedOn;
      }
    }
    data.syncedAt = syncedAt.toISOString();
  } else {
    // Create new stub cache blob
    data = {
      email,
      name,
      found: true,
      projectCount: 1,
      activeCount: 1,
      adminCount: projectMembership.projectAdmin ? 1 : 0,
      hasNoProjects: false,
      syncedAt: syncedAt.toISOString(),
      allRoles: projectMembership.roles,
      allModules: projectMembership.modules,
      projects: [projectBlob],
      companyRole: null,
      lastSignIn: projectMembership.lastSignIn || null,
      isAccountAdmin: false,
      addedOn: projectMembership.addedOn || null,
      autodeskId,
    };
  }

  await prisma.accMemberCache.upsert({
    where: { email },
    create: { email, data, syncedAt },
    update: { data, syncedAt },
  });
}

// Concurrency pool helper
async function runWithConcurrency(limit, array, fn) {
  const results = [];
  const executing = new Set();
  for (const item of array) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL or DIRECT_URL must be set");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
  });

  try {
    log("=== STARTING BULK EXTRACTION OF MONTERREY/MTY PROJECT MEMBERS ===");

    const hubRow = await prisma.project.findFirst({ select: { apsHubId: true } });
    if (!hubRow?.apsHubId) {
      throw new Error("Project.apsHubId is not configured in DB.");
    }
    const hubId = String(hubRow.apsHubId);
    const accountId = hubId.replace(/^b\./, "");
    log(`Resolved Account ID: ${accountId}`);

    const token2Leg = await get2LegToken();
    log("Acquired 2-legged Autodesk token successfully.");

    log("Fetching account companies to map companyIds to names...");
    const companyMap = await fetchAccountCompanies(accountId, token2Leg);
    log(`Mapped ${companyMap.size} companies.`);

    // Query active Monterrey (MTY) projects from DB
    const activeMtyProjects = await prisma.accProject.findMany({
      where: {
        status: "active",
        OR: [
          { name: { contains: "mty", mode: "insensitive" } },
          { name: { contains: "monterrey", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    log(`Found ${activeMtyProjects.length} active Monterrey/MTY projects in the database.`);

    if (activeMtyProjects.length === 0) {
      log("No active MTY projects found. Exiting.");
      return;
    }

    let crawledCount = 0;
    let failedCount = 0;
    let totalMembersPersisted = 0;
    const now = new Date();

    // Process projects with concurrency level of 5
    await runWithConcurrency(5, activeMtyProjects, async (project) => {
      try {
        log(`Processing roles and members for: "${project.name}" (${project.id})...`);
        
        // Fetch project roles to resolve names to IDs
        const roles = await fetchProjectRoles(accountId, project.id, token2Leg);
        
        // Save roles
        for (const role of roles) {
          await prisma.accRole.upsert({
            where: { id: role.id },
            create: {
              id: role.id,
              accountId,
              name: role.name,
              memberCount: 0,
              syncedAt: now,
            },
            update: { name: role.name, syncedAt: now },
          });

          // Default role unassigned row
          const existingDefaultRole = await prisma.accProjectRole.findFirst({
            where: { projectId: project.id, roleId: role.id, memberId: null },
            select: { id: true },
          });
          if (existingDefaultRole) {
            await prisma.accProjectRole.update({
              where: { id: existingDefaultRole.id },
              data: {
                docsAccessLevel: role.docsAccessLevel,
                projectAdminAccessLevel: role.projectAdminAccessLevel,
              },
            });
          } else {
            await prisma.accProjectRole.create({
              data: {
                projectId: project.id,
                roleId: role.id,
                memberId: null,
                docsAccessLevel: role.docsAccessLevel,
                projectAdminAccessLevel: role.projectAdminAccessLevel,
              },
            });
          }
        }

        const roleNameToId = new Map(roles.map((r) => [r.name.toLowerCase(), r]));

        // Fetch members
        const members = await fetchProjectMembers(project.id, token2Leg);
        
        for (const raw of members) {
          if (!raw.autodeskId || !raw.email) continue;
          const email = raw.email.toLowerCase();
          const autodeskId = raw.autodeskId;
          const name = raw.name || email;
          const status = raw.status || "active";
          const companyName = raw.companyId ? (companyMap.get(raw.companyId) || null) : null;
          const phone = typeof raw.phone === "string" ? raw.phone : raw.phone?.number || null;
          const addedOn = raw.addedOn ? new Date(raw.addedOn) : null;
          const lastSignIn = raw.lastSignIn ? new Date(raw.lastSignIn) : null;
          const projectAdmin = raw.accessLevels?.projectAdmin || false;
          const executive = raw.accessLevels?.executive || false;
          const products = normalizeProducts(raw.products);

          // Save AccProjectMember
          const savedMember = await prisma.accProjectMember.upsert({
            where: { projectId_autodeskId: { projectId: project.id, autodeskId } },
            create: {
              projectId: project.id,
              autodeskId,
              email,
              name,
              status,
              companyName,
              phone,
              addedOn,
              lastSignIn,
              projectAdmin,
              executive,
              products,
              syncedAt: now,
            },
            update: {
              email,
              name,
              status,
              companyName,
              phone,
              addedOn,
              lastSignIn,
              projectAdmin,
              executive,
              products,
              syncedAt: now,
            },
          });

          // Link member to each named role on the project
          const rawRoles = Array.isArray(raw.roles) ? raw.roles : [];
          for (const r of rawRoles) {
            if (!r || !r.name) continue;
            const resolvedRole = roleNameToId.get(r.name.toLowerCase());
            if (!resolvedRole) continue;
            
            await prisma.accProjectRole.upsert({
              where: {
                projectId_roleId_memberId: {
                  projectId: project.id,
                  roleId: resolvedRole.id,
                  memberId: savedMember.id,
                },
              },
              create: {
                projectId: project.id,
                roleId: resolvedRole.id,
                memberId: savedMember.id,
                docsAccessLevel: resolvedRole.docsAccessLevel,
                projectAdminAccessLevel: resolvedRole.projectAdminAccessLevel,
              },
              update: {
                docsAccessLevel: resolvedRole.docsAccessLevel,
                projectAdminAccessLevel: resolvedRole.projectAdminAccessLevel,
              },
            });
          }

          // Populate cache
          const projectMembership = {
            projectId: project.id,
            projectName: project.name,
            projectAdmin,
            roles: rawRoles.map((r) => r.name),
            modules: Object.entries(products)
              .filter(([, tier]) => tier !== "none")
              .map(([key]) => key),
            addedOn: addedOn ? addedOn.toISOString() : null,
            lastSignIn: lastSignIn ? lastSignIn.toISOString() : null,
          };
          await mergeAndUpsertUserCache(prisma, email, autodeskId, name, projectMembership, now);
        }

        totalMembersPersisted += members.length;
        crawledCount++;
        log(`Successfully crawled ${members.length} members for: "${project.name}"`);
      } catch (err) {
        failedCount++;
        logErr(`Failed roles & members extraction for "${project.name}" (${project.id}): ${err.message}`);
      }
    });

    log(`\n=== BULK MTY MEMBERS EXTRACTION COMPLETE ===`);
    log(`  • Projects succeeded: ${crawledCount}`);
    log(`  • Projects failed: ${failedCount}`);
    log(`  • Total project member slots synchronized: ${totalMembersPersisted}`);
    log(`============================================\n`);

  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Uncaught fatal error:", err);
  process.exit(1);
});
