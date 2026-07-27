export type ProjectData = {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles?: string[];
  modules?: string[];
  addedOn?: string;
};

export type AccProfileData = {
  found: true;
  status: string;
  name?: string;
  autodeskId?: string;
  syncedAt: string;
  role?: string;
  company?: string;
  addedOn?: string;
  lastSignIn?: string;
  photoUrl?: string | null;
  costCenter?: string | null;
  projects?: ProjectData[];
};

export type StatCardDetailKind = "admin" | "roles" | "modules";

export interface CountSlice {
  name: string;
  value: number;
}
