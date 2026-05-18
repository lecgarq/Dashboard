// Shared types for the ACC users spatial graph. Lives in its own module so the
// presentational sub-components (accGraphParts.tsx) and the main component
// (AccUsersGraph.tsx) can both import without a circular dependency.

export interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface UserNode extends PhysicsNode {
  kind: "user";
  email: string;
  /** Canonical user identifier shared by all (user, project) instances of the
   *  same person. Equals lowercased email. */
  userId: string;
  name: string;
  projectId?: string;
  projectName?: string;
  found: boolean;
  hasNoProjects: boolean;
  isAdmin: boolean;
  projectCount: number;
  roles: string[];
  modules: string[];
  color: string;
  lastAddedBucket: string;
  individualAccess: boolean;
  companyRole: string | null;
  lastSignIn: string | null;
  label?: string;
  degree?: number;
  perProjectRoleNames?: string[];
  aggregatedStatus?: "active" | "pending" | "deleted";
  projectAdmin?: boolean;
  executive?: boolean;
  isAccountAdmin?: boolean;
  companyName?: string | null;
  accessibleFolderHubs?: string[];
  isExternal?: boolean;
}

export type SimNode = UserNode;

export interface SidePanelState {
  node: SimNode;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export type FileActivity = {
  lastView: Date | null;
  lastUpload: Date | null;
  lastEdit: Date | null;
  lastDelete: Date | null;
} | null;
