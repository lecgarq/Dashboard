export interface BulkAccProject {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
}

export interface BulkAccUser {
  email: string;
  name: string;
  found: boolean;
  projectCount: number;
  activeCount: number;
  adminCount: number;
  hasNoProjects: boolean;
  syncedAt: string;
  allRoles: string[];
  allModules: string[];
  projects: BulkAccProject[];
}
