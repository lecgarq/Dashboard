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
// Captured from the ACC web UI on 2026-06-09.

import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

// ACC module ids (fill `modules` per member from the ACC web UI — Project Admin →
// the member's product access). Legend:
//   dataManagement = Docs/Files   build = Build           modelCoordination = Model Coordination
//   designCollaboration = Design Collaboration            insight = Insight
//   preconstruction = Takeoff/Cost  design = Forma         autospecs = AutoSpecs   datum = Datum
// Example: modules: ["dataManagement", "build", "modelCoordination"]

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

export const TEMPLATE_MTY_ROSTER_UPDATED = "2026-06-09";

export const TEMPLATE_MTY_ROSTER: TemplateRosterMember[] = [
  { name: "Cain Cruz Gonzalez",            email: "cain.cruz@hermosillo.com",       company: "Hermosillo", role: "Architect",               accessLevel: "Project Admin" },
  { name: "Diego Adal Barrera Armendariz", email: "diego.barrera@hermosillo.com",   company: "Hermosillo", role: "Designer",                accessLevel: "Project Member" },
  { name: "Elisa Cervantes",               email: "elisa.cervantes@hermosillo.com", company: "Hermosillo", role: "Architect",               accessLevel: "Project Admin" },
  { name: "Elizabeth Soto",                email: "elizabeth.soto@hermosillo.com",  company: "Hermosillo", role: "VDC Innovacion",          accessLevel: "Project Admin" },
  { name: "Evodio Hernández",              email: "evodio.hernandez@hermosillo.com",company: "Hermosillo", role: "Architect",               accessLevel: "Project Admin" },
  { name: "Fernando Becerril",             email: "fernando.becerril@hermosillo.com",company: "Hermosillo",role: "Gerente De Desarrollo",   accessLevel: "Project Member" },
  { name: "Fernando Gonzalez Arechaga",    email: "fernando.gonzalez@hermosillo.com",company: "Hermosillo",role: "Dirección",               accessLevel: "Project Member" },
  { name: "Glenda Lorey Diaz",             email: "glenda.lorey@hermosillo.com",    company: "Hermosillo", role: "Designer",                accessLevel: "Project Member" },
  { name: "Jennifer Martinez",             email: "jennifer.martinez@hermosillo.com",company: "Hermosillo",role: "Designer",                accessLevel: "Project Member" },
  { name: "Jesus Acosta Aguilar",          email: "jesus.acosta@hermosillo.com",    company: "Hermosillo", role: "Designer",                accessLevel: "Project Member" },
  { name: "Josue Balderrama",              email: "josue.balderrama@hermosillo.com",company: "Hermosillo", role: "Core",                    accessLevel: "Project Admin" },
  { name: "Khaled Parra Chá",              email: "khaled.parra@hermosillo.com",    company: "Hermosillo", role: "Gerente De Construccion", accessLevel: "Project Member" },
  { name: "lester gomez",                  email: "lester.gomez@hermosillo.com",    company: "Hermosillo", role: "Designer",                accessLevel: "Project Member" },
  { name: "Lorena Lizarraga Haro",         email: "lorena.haro@hermosillo.com",     company: "Hermosillo", role: "Dirección",               accessLevel: "Project Member" },
  { name: "maria rueda",                   email: "maria.rueda@hermosillo.com",     company: "Hermosillo", role: "Contabilidad",            accessLevel: "Project Member" },
  { name: "miriam felix",                  email: "miriam.felix@hermosillo.com",    company: "Hermosillo", role: "Contabilidad",            accessLevel: "Project Member" },
  { name: "Rogelio Romero",                email: "rogelio.romero@hermosillo.com",  company: "Hermosillo", role: "Designer",                accessLevel: "Project Member" },
  { name: "Sarah Yamil Vazquez Herrera",   email: "sarah.vazquez@hermosillo.com",   company: "Hermosillo", role: "Designer",                accessLevel: "Project Member" },
  { name: "sergio galindo",                email: "sergio.galindo@hermosillo.com",  company: "Hermosillo", role: "Contabilidad",            accessLevel: "Project Member" },
];
