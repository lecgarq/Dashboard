// lib/forma/defaultRoles.ts
// Curated role taxonomy from the owner's "ACC Roles" image (typos corrected).
// This is the immutable seed; a draft stores its own editable copy.
export interface FormaRole {
  id: string; // stable slug
  label: string; // display name
  group: string; // one of FORMA_GROUPS
}

export const FORMA_GROUPS = [
  "BIM",
  "Commercial / Cost",
  "Design",
  "Engineering",
  "Governance",
  "Lean",
  "External",
  "Administration",
  "Safety",
] as const;

export const DEFAULT_FORMA_ROLES: FormaRole[] = [
  { id: "aps-specialist", label: "APS Specialist", group: "BIM" },
  { id: "modeler-specialist", label: "Modeler Specialist", group: "BIM" },
  { id: "vdc-specialist", label: "VDC Specialist", group: "BIM" },
  { id: "estimator-specialist", label: "Estimator Specialist", group: "Commercial / Cost" },
  { id: "procurement-specialist", label: "Procurement Specialist", group: "Commercial / Cost" },
  { id: "site-specialist", label: "Site Specialist", group: "Commercial / Cost" },
  { id: "architect", label: "Architect", group: "Design" },
  { id: "civil-engineer", label: "Civil Engineer", group: "Engineering" },
  { id: "electrical-engineer", label: "Electrical Engineer", group: "Engineering" },
  { id: "fire-protection-engineer", label: "Fire Protection Engineer", group: "Engineering" },
  { id: "hvac-engineer", label: "HVAC Engineer", group: "Engineering" },
  { id: "mechanical-engineer", label: "Mechanical Engineer", group: "Engineering" },
  { id: "plumbing-engineer", label: "Plumbing Engineer", group: "Engineering" },
  { id: "site-engineer", label: "Site Engineer", group: "Engineering" },
  { id: "special-systems-engineer", label: "Special Systems Engineer", group: "Engineering" },
  { id: "structural-engineer", label: "Structural Engineer", group: "Engineering" },
  { id: "telecommunications-engineer", label: "Telecommunications Engineer", group: "Engineering" },
  { id: "core-member", label: "Core Member", group: "Governance" },
  { id: "executive-manager", label: "Executive Manager", group: "Governance" },
  { id: "lean-specialist", label: "Lean Specialist", group: "Lean" },
  { id: "contractor", label: "Contractor", group: "External" },
  { id: "owner", label: "Owner", group: "External" },
  { id: "project-administrator", label: "Project Administrator", group: "Administration" },
  { id: "document-controller", label: "Document Controller", group: "Administration" },
  { id: "safety-manager", label: "Safety Manager", group: "Safety" },
];
