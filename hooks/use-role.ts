"use client";

import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";

export function useRole() {
  const { role, status, isAdmin, isEditor, isViewer, isManager } = useDashboardAuth();

  return {
    role,
    status,
    isAdmin,
    isEditor,
    isViewer,
    isManager,
    isLoading: status === "loading",
  };
}


