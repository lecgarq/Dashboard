export type ModuleId =
  | "dataManagement" | "insight" | "build" | "modelCoordination"
  | "designCollaboration" | "preconstruction" | "design" | "autospecs" | "datum";

export interface AccessInstance {
  projectId: string;
  projectName: string;
  userId: string;
  email: string;
  name: string;
  isInternal: boolean;       // email ends with "@hermosillo.com"
  isAdmin: boolean;          // any product accessLevel === "project_admin"
  status: string | null;     // membership status (e.g. "active" | "pending")
  addedOn: string | null;    // ISO date string or null
  company: string | null;    // company display name
  roles: string[];           // role display names
  modules: ModuleId[];       // modules this instance has (any non-none product)
  adminModules: ModuleId[];  // modules where this instance is project_admin
}

export interface FilterState {
  projectId: string[];
  company: string[];
  role: string[];
  module: ModuleId[];
  internalExternal: "internal" | "external" | null;
  adminMember: "admin" | "member" | null;
  dateFrom: string | null;   // ISO; filters addedOn >=
  dateTo: string | null;     // ISO; filters addedOn <=
  search: string;            // fuzzy over name/email/projectName/company
}

export const EMPTY_FILTERS: FilterState = {
  projectId: [], company: [], role: [], module: [],
  internalExternal: null, adminMember: null, dateFrom: null, dateTo: null, search: "",
};

export interface Category { label: string; value: number; key?: string }

export interface SummaryDTO {
  counts: { users: number; projects: number; access: number; roles: number; companies: number };
  composition: {
    internalExternal: { internal: number; external: number };
    permission: { admin: number; member: number };
  };
  modules: Array<{ id: ModuleId; label: string; admin: number; member: number; total: number }>;
  rankings: { topProjects: Category[]; membersPerRole: Category[]; topCompanies: Category[] };
  risk: { externalMembers: number; externalAdmins: number; projectAdmins: number; pending: number };
}
