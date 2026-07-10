// lib/acc/template-mty-roster.ts
//
// The ACC Template MTY "Project Members" roster — the members configured to be
// included in projects created from the template
// (acc.autodesk.com/project-admin/project-members/projects/<id>).
//
// IMPORTANT: this roster is NOT available through any ACC OAuth API. Every
// members endpoint (admin v1/v2, HQ, BIM360, Docs, Data Management; 2-/3-legged;
// act-as-user) returns only the 4 permission-holders, not this 19-person
// roster — it lives solely in ACC's web layer. So it is maintained here by hand:
// to update, copy the roster from the ACC Project Members page and edit this list.
//
// Captured from the ACC web UI on 2026-06-09; per-member module access (the
// "Product access enabled" column) added 2026-06-10.

import type { ModuleId } from "@/lib/acc/accessInstanceTypes";

// ACC module ids (the "Product access enabled" column on the member detail).
// Legend:
//   dataManagement = Data Management (Docs/Files)   build = Build
//   modelCoordination = Model Coordination          designCollaboration = Design Collaboration
//   costManagement = Cost Management                insight = Insight
//   preconstruction = Takeoff                        design = Forma   autospecs = AutoSpecs   datum = Datum

type TemplateAccessLevel = "Project Admin" | "Project Member";

export interface TemplateRosterMember {
  name: string;
  email: string;
  company: string;
  role: string;
  accessLevel: TemplateAccessLevel;
  /** ACC modules this member is provisioned for. Empty until captured by hand. */
  modules?: ModuleId[];
}

export const TEMPLATE_MTY_ROSTER_UPDATED = "2026-06-10";

export const TEMPLATE_MTY_ROSTER: TemplateRosterMember[] = [
  { name: "Cain Cruz Gonzalez",            email: "cain.cruz@hermosillo.com",       company: "Hermosillo", role: "Architect",               accessLevel: "Project Admin",  modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Diego Adal Barrera Armendariz", email: "diego.barrera@hermosillo.com",   company: "Hermosillo", role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Elisa Cervantes",               email: "elisa.cervantes@hermosillo.com", company: "Hermosillo", role: "Architect",               accessLevel: "Project Admin",  modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Elizabeth Soto",                email: "elizabeth.soto@hermosillo.com",  company: "Hermosillo", role: "VDC Innovacion",          accessLevel: "Project Admin",  modules: ["dataManagement", "designCollaboration", "modelCoordination", "build"] },
  { name: "Evodio Hernández",              email: "evodio.hernandez@hermosillo.com",company: "Hermosillo", role: "Architect",               accessLevel: "Project Admin",  modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Fernando Becerril",             email: "fernando.becerril@hermosillo.com",company: "Hermosillo",role: "Gerente De Desarrollo",   accessLevel: "Project Member", modules: ["dataManagement"] },
  { name: "Fernando Gonzalez Arechaga",    email: "fernando.gonzalez@hermosillo.com",company: "Hermosillo",role: "Dirección",               accessLevel: "Project Member", modules: ["dataManagement", "build"] },
  { name: "Glenda Lorey Diaz",             email: "glenda.lorey@hermosillo.com",    company: "Hermosillo", role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Jennifer Martinez",             email: "jennifer.martinez@hermosillo.com",company: "Hermosillo",role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Jesus Acosta Aguilar",          email: "jesus.acosta@hermosillo.com",    company: "Hermosillo", role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Josue Balderrama",              email: "josue.balderrama@hermosillo.com",company: "Hermosillo", role: "Core",                    accessLevel: "Project Admin",  modules: ["dataManagement", "designCollaboration", "modelCoordination", "build", "costManagement"] },
  { name: "Khaled Parra Chá",              email: "khaled.parra@hermosillo.com",    company: "Hermosillo", role: "Gerente De Construccion", accessLevel: "Project Member", modules: ["dataManagement"] },
  { name: "lester gomez",                  email: "lester.gomez@hermosillo.com",    company: "Hermosillo", role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Lorena Lizarraga Haro",         email: "lorena.haro@hermosillo.com",     company: "Hermosillo", role: "Dirección",               accessLevel: "Project Member", modules: ["dataManagement"] },
  { name: "maria rueda",                   email: "maria.rueda@hermosillo.com",     company: "Hermosillo", role: "Contabilidad",            accessLevel: "Project Member", modules: ["dataManagement"] },
  { name: "miriam felix",                  email: "miriam.felix@hermosillo.com",    company: "Hermosillo", role: "Contabilidad",            accessLevel: "Project Member", modules: ["dataManagement"] },
  { name: "Rogelio Romero",                email: "rogelio.romero@hermosillo.com",  company: "Hermosillo", role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "Sarah Yamil Vazquez Herrera",   email: "sarah.vazquez@hermosillo.com",   company: "Hermosillo", role: "Designer",                accessLevel: "Project Member", modules: ["dataManagement", "designCollaboration", "modelCoordination"] },
  { name: "sergio galindo",                email: "sergio.galindo@hermosillo.com",  company: "Hermosillo", role: "Contabilidad",            accessLevel: "Project Member", modules: ["dataManagement"] },
];
