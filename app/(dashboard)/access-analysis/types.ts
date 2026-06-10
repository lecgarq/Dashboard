export type ModuleId =
  | "dataManagement" | "insight" | "build" | "modelCoordination"
  | "designCollaboration" | "preconstruction" | "design" | "autospecs" | "datum"
  | "costManagement";

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
